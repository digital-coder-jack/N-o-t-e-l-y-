"""Safe multi-provider router for Notely's three product AI tiers.

All health and failure metadata is deliberately secret-free. Cooldowns, probe
cache and stream coordination are process-local; on Vercel they are best-effort
per warm instance, not a distributed lock.
"""
from __future__ import annotations
import asyncio, hashlib, hmac, json, logging, os, time
from typing import AsyncGenerator
import httpx

logger = logging.getLogger("ai-notebook.providers")
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash")
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "openrouter/free")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b")
TIER_CONFIG = {
 "default":{"display_name":"AI Notebook","provider":"gemini","env":"GEMINI_API_KEY","model_env":"GEMINI_MODEL","model":GEMINI_MODEL},
 "pro":{"display_name":"AI Notebook Pro","provider":"openrouter","env":"OPENROUTER_API_KEY","model_env":"OPENROUTER_MODEL","model":OPENROUTER_MODEL},
 "pro_max":{"display_name":"AI Notebook Pro Max","provider":"groq","env":"GROQ_API_KEY","model_env":"GROQ_MODEL","model":GROQ_MODEL},
}
VALID_SELECTIONS = ["auto", "default", "pro", "pro_max"]
_LEGACY_SELECTIONS = {"ai_notebook":"default", "ai_notebook_light":"default"}
_FRIENDLY = {
 "invalid_key":"This AI tier could not authenticate. Trying another available tier.",
 "quota_or_rate_limit":"This AI tier is temporarily at capacity. Trying another available tier.",
 "model_not_found":"This AI model is unavailable. Trying another available tier.",
 "bad_request":"This AI tier rejected the request. Trying another available tier.",
 "timeout":"The AI tier took too long to respond. Trying another available tier.",
 "network":"The AI tier could not be reached. Trying another available tier.",
 "provider_5xx":"The AI service is temporarily unavailable. Trying another available tier.",
 "parse_error":"The AI service returned an unreadable response. Trying another available tier.",
 "not_configured":"This AI tier is not configured.",
 "unavailable":"AI is temporarily unavailable. Please try again shortly.",
}
_STREAM_TOTAL_TIMEOUT = int(os.environ.get("AI_STREAM_TIMEOUT", "75"))
_STREAM_IDLE_TIMEOUT = int(os.environ.get("AI_STREAM_IDLE_TIMEOUT", "20"))
_CACHE: dict[str, tuple[float,str]] = {}
_CACHE_TTL = int(os.environ.get("AI_CACHE_TTL", "900")); _CACHE_MAX=256
_COOLDOWN: dict[str, tuple[float,str]] = {}
_COOLDOWN_SECONDS = int(os.environ.get("AI_TIER_COOLDOWN_SECONDS", "30"))
_LAST_PROBES: dict[str, dict] = {}
_PROBE_CACHE: tuple[float, list[dict]] | None = None


def _normalize_selection(selection):
 c=_LEGACY_SELECTIONS.get((selection or "auto").strip().lower(),(selection or "auto").strip().lower())
 return c if c in TIER_CONFIG else "default"
def _tier(tier): return TIER_CONFIG[_normalize_selection(tier)]
def tier_display_name(tier): return _tier(tier)["display_name"]
def provider_key(tier="default"): return os.environ.get(_tier(tier)["env"],"").strip()
def provider_available(tier="default"): return bool(provider_key(tier))
def available_tiers(): return [t for t in TIER_CONFIG if provider_available(t)]
def resolve_order(selection):
 choice=(selection or "auto").strip().lower()
 choice=_LEGACY_SELECTIONS.get(choice,choice)
 if choice == "auto" or choice not in TIER_CONFIG: return list(TIER_CONFIG)
 return [choice] + [t for t in TIER_CONFIG if t != choice]

def status_snapshot():
 tiers=[]
 for tier,cfg in TIER_CONFIG.items():
  probe=_LAST_PROBES.get(tier)
  configured=provider_available(tier)
  if not configured: health = "down"
  elif not probe: health = "unknown"
  elif probe.get("ok"): health = "ok"
  elif probe.get("error_class") in ("invalid_key", "model_not_found", "bad_request"): health = "down"
  else: health = "degraded"
  tiers.append({"id":tier,"label":cfg["display_name"],"configured":configured,
   "health":health,
   "last_probe_ok":probe.get("ok") if probe else None,
   "last_probe_at":probe.get("checked_at") if probe else None,
   "latency_ms":probe.get("latency_ms") if probe else None})
 return {"available":any(t["configured"] and t["health"] != "down" for t in tiers),"name":"AI Notebook","providers":tiers,"tiers":tiers,"any_configured":any(t["configured"] for t in tiers)}

def _cache_key(tier,messages,temperature,max_tokens):
 raw=json.dumps({"tier":tier,"m":messages,"t":temperature,"k":max_tokens},sort_keys=True,separators=(",",":"))
 return hashlib.sha256(raw.encode()).hexdigest()
def _cache_get(key):
 hit=_CACHE.get(key)
 if not hit:return None
 if time.time()-hit[0]>_CACHE_TTL:_CACHE.pop(key,None);return None
 return hit[1]
def _cache_set(key,value):
 if len(_CACHE)>=_CACHE_MAX:_CACHE.pop(min(_CACHE,key=lambda k:_CACHE[k][0]),None)
 _CACHE[key]=(time.time(),value)
def _timeout(total=35): return httpx.Timeout(connect=5.0,read=15.0,write=8.0,pool=5.0)
def _openai_headers(key,tier):
 h={"Authorization":f"Bearer {key}","Content-Type":"application/json","Accept":"application/json"}
 if tier=="pro": h["HTTP-Referer"]=os.environ.get("OPENROUTER_SITE_URL","https://notely-frontend.vercel.app"); h["X-Title"]="Notely"
 return h
def _openai_payload(model,messages,temperature,max_tokens,stream):
 return {"model":model,"messages":messages,"temperature":temperature,"max_tokens":max_tokens,"stream":stream}
def _gemini_contents(messages):
 contents=[]; system_parts=[]
 for m in messages:
  role=m.get("role","user"); value=str(m.get("content",""))
  if not value:continue
  if role=="system":system_parts.append({"text":value});continue
  contents.append({"role":"model" if role=="assistant" else "user","parts":[{"text":value}]})
 return contents,({"parts":system_parts} if system_parts else None)
def _gemini_payload(messages,temperature,max_tokens):
 contents,system=_gemini_contents(messages)
 p={"contents":contents,"generationConfig":{"temperature":temperature,"maxOutputTokens":max_tokens}}
 if system:p["systemInstruction"]=system
 return p
def _classify_status(status):
 if status in (401,403):return "invalid_key"
 if status==429:return "quota_or_rate_limit"
 if status==404:return "model_not_found"
 if status in (400,422):return "bad_request"
 if status>=500:return "provider_5xx"
 return "bad_request"
def _record_failure(tier,error_class,status=None):
 _COOLDOWN[tier]=(time.monotonic()+_COOLDOWN_SECONDS,error_class)
 logger.warning("ai_tier_failure tier=%s class=%s status=%s",tier,error_class,status)
def _classify_exception(exc):
 if isinstance(exc,httpx.TimeoutException):return "timeout"
 if isinstance(exc,httpx.RequestError):return "network"
 if isinstance(exc,(ValueError,KeyError,IndexError,TypeError,json.JSONDecodeError)):return "parse_error"
 if isinstance(exc,RuntimeError) and str(exc) in _FRIENDLY:return str(exc)
 return "provider_5xx"
def _parse_openai_response(data):
 value=data["choices"][0]["message"]["content"]
 if isinstance(value,list):value="".join(str(x.get("text","")) if isinstance(x,dict) else str(x) for x in value)
 return str(value or "").strip()
def _parse_gemini_response(data):
 parts=data["candidates"][0]["content"]["parts"]
 return "".join(str(p.get("text","")) for p in parts if isinstance(p,dict)).strip()
async def _request_completion(tier,messages,temperature,max_tokens,timeout=None):
 cfg=_tier(tier); key=provider_key(tier)
 if not key:raise RuntimeError("not_configured")
 async with httpx.AsyncClient(timeout=timeout or _timeout()) as client:
  if cfg["provider"]=="gemini":
   resp=await client.post(f"{GEMINI_BASE_URL}/models/{cfg['model']}:generateContent",json=_gemini_payload(messages,temperature,max_tokens),headers={"x-goog-api-key":key,"Content-Type":"application/json","Accept":"application/json"})
  else:
   base=OPENROUTER_BASE_URL if cfg["provider"]=="openrouter" else GROQ_BASE_URL
   resp=await client.post(f"{base}/chat/completions",json=_openai_payload(cfg["model"],messages,temperature,max_tokens,False),headers=_openai_headers(key,tier))
 if resp.status_code != 200:raise ProviderError(_classify_status(resp.status_code),resp.status_code,resp.headers.get("Retry-After"))
 try:
  data=resp.json(); text=_parse_gemini_response(data) if cfg["provider"]=="gemini" else _parse_openai_response(data)
 except (ValueError,KeyError,IndexError,TypeError) as e:raise ProviderError("parse_error",resp.status_code) from e
 if not text:raise ProviderError("parse_error",resp.status_code)
 return text
class ProviderError(RuntimeError):
 def __init__(self,error_class,status=None,retry_after=None):super().__init__(error_class);self.error_class=error_class;self.status=status;self.retry_after=retry_after
async def _complete_tier(tier,messages,temperature,max_tokens):
 # Retry once on 429/5xx, respecting Retry-After within the total time budget.
 cfg=_tier(tier); key=provider_key(tier)
 if not key:raise ProviderError("not_configured")
 for attempt in range(2):
  try:return await _request_completion(tier,messages,temperature,max_tokens)
  except ProviderError as e:
   if e.error_class not in ("quota_or_rate_limit","provider_5xx") or attempt:raise
   delay = 0.5
   try:
    if e.retry_after: delay = min(2.0, max(0.0, float(e.retry_after)))
   except (TypeError, ValueError): pass
   await asyncio.sleep(delay)

async def chat(messages,*,selection="auto",temperature=0.7,max_tokens=1024,use_cache=True):
 cache_key=_cache_key(_normalize_selection(selection),messages,temperature,max_tokens)
 if use_cache:
  cached=_cache_get(cache_key)
  if cached is not None:return (_normalize_selection(selection),cached)
 last="unavailable"
 for tier in resolve_order(selection):
  if not provider_available(tier):last="not_configured";continue
  cooldown=_COOLDOWN.get(tier)
  if cooldown and cooldown[0]>time.monotonic():last=cooldown[1];continue
  try:
   text=await _complete_tier(tier,messages,temperature,max_tokens)
   _COOLDOWN.pop(tier,None)
   if use_cache:_cache_set(cache_key,text)
   return tier,text
  except Exception as exc:
   last=_classify_exception(exc); status=getattr(exc,"status",None);_record_failure(tier,last,status)
 if last=="not_configured":last="unavailable"
 return ("default", _FRIENDLY.get(last,_FRIENDLY["unavailable"]))

async def probe_tier(tier):
 cfg=_tier(tier); started=time.monotonic(); checked=time.time()
 result={"tier":tier,"ok":False,"http_status":None,"error_class":None,"latency_ms":0,"model":cfg["model"],"checked_at":checked}
 if not provider_available(tier):result.update(error_class="not_configured",latency_ms=int((time.monotonic()-started)*1000));_LAST_PROBES[tier]=result;return result
 try:
  await _request_completion(tier,[{"role":"user","content":"Reply with OK only."}],0,4,timeout=httpx.Timeout(connect=5.0,read=10.0,write=5.0,pool=5.0))
  result["ok"]=True;result["http_status"]=200;_COOLDOWN.pop(tier,None)
 except Exception as exc:
  result["error_class"]=_classify_exception(exc);result["http_status"]=getattr(exc,"status",None);_record_failure(tier,result["error_class"],result["http_status"])
 result["latency_ms"]=int((time.monotonic()-started)*1000);_LAST_PROBES[tier]=result
 return {k:v for k,v in result.items() if k!="checked_at"} | {"checked_at":checked}
async def diagnose_all(force=False):
 global _PROBE_CACHE
 now=time.monotonic()
 if not force and _PROBE_CACHE and now-_PROBE_CACHE[0]<60:return [dict(x) for x in _PROBE_CACHE[1]]
 results=[]
 for tier in TIER_CONFIG:results.append(await probe_tier(tier))
 _PROBE_CACHE=(time.monotonic(),results)
 return [dict(x) for x in results]

async def _stream_tier(tier,messages,temperature,max_tokens,cancel_event):
 cfg=_tier(tier);key=provider_key(tier)
 if not key:raise ProviderError("not_configured")
 timeout=httpx.Timeout(connect=5.0,read=_STREAM_IDLE_TIMEOUT,write=8.0,pool=5.0)
 async with httpx.AsyncClient(timeout=timeout) as client:
  if cfg["provider"]=="gemini":
   request=client.stream("POST",f"{GEMINI_BASE_URL}/models/{cfg['model']}:streamGenerateContent",params={"alt":"sse"},json=_gemini_payload(messages,temperature,max_tokens),headers={"x-goog-api-key":key,"Content-Type":"application/json","Accept":"text/event-stream"})
  else:
   base=OPENROUTER_BASE_URL if cfg["provider"]=="openrouter" else GROQ_BASE_URL
   request=client.stream("POST",f"{base}/chat/completions",json=_openai_payload(cfg["model"],messages,temperature,max_tokens,True),headers={**_openai_headers(key,tier),"Accept":"text/event-stream"})
  async with request as resp:
   if resp.status_code!=200:raise ProviderError(_classify_status(resp.status_code),resp.status_code)
   deadline=time.monotonic()+_STREAM_TOTAL_TIMEOUT; line_iter=resp.aiter_lines().__aiter__()
   while True:
    if cancel_event is not None and cancel_event.is_set():return
    if time.monotonic()>deadline:raise httpx.ReadTimeout("total stream deadline")
    try:line=await asyncio.wait_for(line_iter.__anext__(),timeout=_STREAM_IDLE_TIMEOUT)
    except StopAsyncIteration:return
    except asyncio.TimeoutError as e:raise httpx.ReadTimeout("stream idle timeout") from e
    line=line.strip()
    if not line.startswith("data:"):continue
    raw=line[5:].strip()
    if raw=="[DONE]":return
    try:chunk=json.loads(raw)
    except json.JSONDecodeError:raise ProviderError("parse_error")
    if chunk.get("error"):raise ProviderError("provider_5xx")
    try:
     token=_parse_gemini_response(chunk) if cfg["provider"]=="gemini" else (chunk["choices"][0].get("delta",{}).get("content") or "")
    except (KeyError,IndexError,TypeError):
     if cfg["provider"]=="gemini":raise ProviderError("parse_error")
     continue
    if token:yield str(token)

async def chat_stream(messages,*,selection="auto",temperature=0.7,max_tokens=1024,cancel_event=None):
 last="unavailable"
 for tier in resolve_order(selection):
  if cancel_event is not None and cancel_event.is_set():yield ("cancelled","cancelled before start");return
  if not provider_available(tier):last="not_configured";continue
  cooldown=_COOLDOWN.get(tier)
  if cooldown and cooldown[0]>time.monotonic():last=cooldown[1];continue
  for attempt in range(2):
   produced=False
   try:
    async for token in _stream_tier(tier,messages,temperature,max_tokens,cancel_event):
     if cancel_event is not None and cancel_event.is_set():yield ("cancelled","cancelled");return
     if not produced:produced=True;yield ("meta",TIER_CONFIG[tier]["display_name"])
     yield ("token",token)
    if cancel_event is not None and cancel_event.is_set():yield ("cancelled","cancelled");return
    if produced:return
    last="parse_error"
    if attempt == 0: continue
    _record_failure(tier,last)
    break
   except Exception as exc:
    last=_classify_exception(exc)
    if produced:
     _record_failure(tier,last,getattr(exc,"status",None))
     yield ("error",{"type":last,"message":_FRIENDLY.get(last,_FRIENDLY["unavailable"]).replace(" Trying another available tier.","")});return
    status=getattr(exc,"status",None)
    if attempt == 0 and last in ("quota_or_rate_limit","provider_5xx"):
     delay=0.5
     try:
      retry_after=getattr(exc,"retry_after",None)
      if retry_after: delay=min(2.0,max(0.0,float(retry_after)))
     except (TypeError,ValueError): pass
     await asyncio.sleep(delay)
     continue
    _record_failure(tier,last,status)
    break
 if last=="not_configured":last="unavailable"
 yield ("error",{"type":last,"message":_FRIENDLY.get(last,_FRIENDLY["unavailable"])})

async def groq_chat(messages,**kwargs):return await chat(messages,selection=kwargs.pop("selection","default"),**kwargs)
async def groq_chat_stream(messages,**kwargs):
 async for event,value in chat_stream(messages,selection=kwargs.pop("selection","default"),**kwargs):yield event,value
