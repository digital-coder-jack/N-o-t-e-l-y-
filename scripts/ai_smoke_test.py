#!/usr/bin/env python3
"""Notely AI API smoke test. Never prints credentials or provider key values."""
from __future__ import annotations
import argparse, asyncio, json, os, secrets, string, time, uuid
from typing import Any
import httpx

RESULTS: list[dict[str, Any]] = []
def record(name, status, started, detail="", error_class="-"):
    RESULTS.append({"test": name, "status": status, "latency_ms": round((time.perf_counter()-started)*1000),
                    "error_class": error_class, "detail": str(detail).replace("\n", " ")[:160]})
def parse_frames(buffer):
    events=[]; frames=buffer.split("\n\n")
    for frame in frames[:-1]:
        for line in frame.splitlines():
            if line.startswith("data:"):
                try:
                    obj=json.loads(line[5:].strip())
                    if isinstance(obj,dict): events.append(obj)
                except json.JSONDecodeError: pass
    return events, frames[-1]
def error_class(response):
    try:
        body=response.json()
        return str(body.get("error_class") or body.get("detail") or f"http_{response.status_code}")
    except Exception: return f"http_{response.status_code}"
async def read_stream(client, chat_id, headers, content, model="auto"):
    events=[]
    async with client.stream("POST", f"/api/chats/{chat_id}/stream", headers=headers,
                             json={"content":content,"model":model}, timeout=260) as response:
        if response.status_code != 200:
            raise RuntimeError(f"stream_http_{response.status_code}")
        buffer=""
        async for part in response.aiter_text():
            buffer+=part
            new,buffer=parse_frames(buffer); events.extend(new)
            if any(e.get("event") in ("done","error","cancelled") for e in new): break
    return events
async def local_provider_unit_tests():
    started=time.perf_counter()
    try:
        from backend import providers
        old_available,old_stream=providers.provider_available,providers._stream_tier
        old_cooldowns=providers._COOLDOWNS.copy()
        providers._COOLDOWNS.clear()
        started=time.perf_counter()
        async def fake_stream(tier,messages,temperature,max_tokens,cancel_event):
            if tier=="default": raise providers.ProviderFailure("timeout")
            yield "simulated answer"
        providers.provider_available=lambda tier="default": True
        providers._stream_tier=fake_stream
        try:
            events=[e async for e in providers.chat_stream([{"role":"user","content":"test"}],selection="auto")]
            ok=events[0]==("meta","AI Notebook Pro") and ("token","simulated answer") in events
            record("Failover simulation: default timeout to Pro","PASS" if ok else "FAIL",started,"In-process forced timeout; no real key changed.","-" if ok else "fallback_failed")
        finally:
            providers.provider_available,providers._stream_tier=old_available,old_stream
            providers._COOLDOWNS.clear(); providers._COOLDOWNS.update(old_cooldowns)
        old_available,old_stream=providers.provider_available,providers._stream_tier
        started=time.perf_counter()
        async def all_fail(tier,messages,temperature,max_tokens,cancel_event):
            raise providers.ProviderFailure("invalid_key",401)
            yield "unreachable"
        providers.provider_available=lambda tier="default": True; providers._stream_tier=all_fail
        try:
            events=[e async for e in providers.chat_stream([{"role":"user","content":"test"}],selection="auto")]
            err=next((v for k,v in events if k=="error"),{})
            ok=bool(err.get("message")) and "raw" not in str(err).lower()
            record("Sanitized provider error event","PASS" if ok else "FAIL",started,"Friendly error; no raw upstream body.","-" if ok else "error_not_sanitized")
        finally:
            providers.provider_available,providers._stream_tier=old_available,old_stream
            providers._COOLDOWNS.clear(); providers._COOLDOWNS.update(old_cooldowns)
    except Exception as exc: record("Local provider unit tests","FAIL",started,type(exc).__name__,"unit_test_error")

async def run(base_url, diag_token):
    timeout=httpx.Timeout(260,connect=10)
    async with httpx.AsyncClient(base_url=base_url.rstrip("/"),timeout=timeout,follow_redirects=False) as client:
        for path in ("/api/health","/api/ai/status"):
            t=time.perf_counter()
            try:
                r=await client.get(path,headers={"Accept":"application/json"})
                ok=r.status_code==200 and "application/json" in r.headers.get("content-type","")
                record(f"Unauthenticated {path}","PASS" if ok else "FAIL",t,f"status={r.status_code}; type={r.headers.get('content-type','')}", "-" if ok else "deployment_protection_or_http")
            except Exception as exc: record(f"Unauthenticated {path}","FAIL",t,type(exc).__name__,"network")
        t=time.perf_counter()
        try:
            r=await client.get("/api/chats")
            record("Missing bearer token returns 401","PASS" if r.status_code==401 else "FAIL",t,f"status={r.status_code}","-" if r.status_code==401 else "auth_guard")
        except Exception as exc: record("Missing bearer token returns 401","FAIL",t,type(exc).__name__,"network")
        if diag_token:
            t=time.perf_counter()
            try:
                r=await client.get("/api/ai/diagnose",headers={"X-Diag-Token":diag_token},params={"force":"true"})
                if r.status_code==200:
                    for p in r.json().get("results",[]):
                        ok=bool(p.get("ok"))
                        record(f"Live probe: {p.get('tier')}","PASS" if ok else "FAIL",t,
                               f"model={p.get('model')}; latency_ms={p.get('latency_ms')}",p.get("error_class") or "-")
                else: record("Live tier probes","FAIL",t,f"status={r.status_code}",error_class(r))
            except Exception as exc: record("Live tier probes","FAIL",t,type(exc).__name__,"network")
        else: record("Live tier probes","SKIP",time.perf_counter(),"Set DIAG_TOKEN locally to run protected probes.")
        stamp=f"{int(time.time())}-{uuid.uuid4().hex[:6]}"
        email=f"notely-ai-smoke-{stamp}@example.com"; username=f"notely_smoke_{stamp.replace('-','_')}"
        alphabet=string.ascii_letters+string.digits; password="".join(secrets.choice(alphabet) for _ in range(24))+"aA7!"
        token=None; account_created=False; chat_id=None; topic_id=None; file_id=None
        try:
            t=time.perf_counter()
            r=await client.post("/api/auth/signup",json={"name":"Notely AI Smoke Test","username":username,"email":email,"password":password,"confirm_password":password})
            if r.status_code not in (200,201):
                record("Signup temporary account","FAIL",t,f"status={r.status_code}",error_class(r)); return 1
            account_created=True; token=r.json().get("token")
            if not token: record("Signup temporary account","FAIL",t,"No token returned","parse_error"); return 1
            headers={"Authorization":f"Bearer {token}"}
            record("Signup temporary account","PASS",t,"Temporary account created.")
            t=time.perf_counter(); r=await client.post("/api/auth/login",json={"identifier":email,"password":password})
            ok=r.status_code==200 and bool(r.json().get("token"))
            if ok: token=r.json()["token"]; headers={"Authorization":f"Bearer {token}"}
            record("Login temporary account","PASS" if ok else "FAIL",t,f"status={r.status_code}","-" if ok else error_class(r))
            t=time.perf_counter(); r=await client.post("/api/chats",headers=headers,json={"title":"Notely AI smoke test"})
            if r.status_code==200: chat_id=int(r.json()["chat"]["id"]); record("Create temporary chat","PASS",t,f"id={chat_id}")
            else: record("Create temporary chat","FAIL",t,f"status={r.status_code}",error_class(r)); return 1
            t=time.perf_counter()
            try:
                events=await read_stream(client,chat_id,headers,"Reply with one short sentence confirming this is an AI smoke test.")
                names=[e.get("event") for e in events]
                ok=all(n in names for n in ("start","provider","token","done")) and "error" not in names
                record("Chat SSE start/provider/token/done","PASS" if ok else "FAIL",t,",".join(map(str,names)),"-" if ok else "sse_contract")
            except Exception as exc: record("Chat SSE start/provider/token/done","FAIL",t,type(exc).__name__,"stream_failed")
            t=time.perf_counter(); r=await client.get(f"/api/chats/{chat_id}",headers=headers)
            msgs=r.json().get("messages",[]) if r.status_code==200 else []
            ok=any(m.get("role")=="assistant" and str(m.get("content","")).strip() for m in msgs)
            record("Assistant reply saved across requests","PASS" if ok else "FAIL",t,f"status={r.status_code}; saved={ok}","-" if ok else "persistence_or_provider")
            t=time.perf_counter(); r=await client.post(f"/api/chats/{chat_id}/stream",headers=headers,json={"content":"x"*8001})
            record("Too-long chat input returns 422","PASS" if r.status_code==422 else "FAIL",t,f"status={r.status_code}","-" if r.status_code==422 else "validation")
            t=time.perf_counter(); r=await client.post("/api/tools/quiz",headers=headers,json={"topic":""})
            record("Tool validation returns 422","PASS" if r.status_code==422 else "FAIL",t,f"status={r.status_code}","-" if r.status_code==422 else "validation")
            t=time.perf_counter(); r=await client.get("/api/ai/models",headers=headers)
            ok=r.status_code==200 and "options" in r.json()
            record("GET /api/ai/models","PASS" if ok else "FAIL",t,f"status={r.status_code}","-" if ok else error_class(r))
            t=time.perf_counter(); r=await client.put("/api/ai/model",headers=headers,json={"model":"default"})
            ok=r.status_code==200 and r.json().get("selected")=="default"
            record("PUT /api/ai/model","PASS" if ok else "FAIL",t,f"status={r.status_code}","-" if ok else error_class(r))
            t=time.perf_counter()
            try:
                events=await read_stream(client,chat_id,headers,"Say only: model switch passed.","default")
                names=[e.get("event") for e in events]; ok=all(n in names for n in ("provider","token","done")) and "error" not in names
                record("Stream after model switch","PASS" if ok else "FAIL",t,",".join(map(str,names)),"-" if ok else "sse_contract")
            except Exception as exc: record("Stream after model switch","FAIL",t,type(exc).__name__,"stream_failed")
            tools=[
                ("Tool summarize","/api/tools/summarize",{"text":"Photosynthesis converts light energy into chemical energy in plants."}),
                ("Tool notes","/api/tools/notes",{"topic":"Photosynthesis"}),
                ("Tool quiz","/api/tools/quiz",{"topic":"Photosynthesis","num_questions":2}),
                ("Tool flashcards","/api/tools/flashcards",{"topic":"Photosynthesis","num_cards":2}),
                ("Tool plan","/api/tools/plan",{"goal":"Revise photosynthesis","days":2}),
                ("Tool homework","/api/tools/homework",{"question":"In one sentence, what is photosynthesis?"}),
            ]
            for name,path,body in tools:
                t=time.perf_counter()
                try:
                    r=await client.post(path,headers=headers,json=body); ok=r.status_code==200
                    record(name,"PASS" if ok else "FAIL",t,f"status={r.status_code}","-" if ok else error_class(r))
                except Exception as exc: record(name,"FAIL",t,type(exc).__name__,"request_failed")
            t=time.perf_counter(); r=await client.post("/api/topics",headers=headers,json={"title":"Notely AI smoke topic"})
            if r.status_code==200:
                topic_id=int(r.json()["topic"]["id"]); record("Create temporary topic","PASS",t,f"id={topic_id}")
                t=time.perf_counter(); r=await client.post(f"/api/topics/{topic_id}/generate/summary",headers=headers,json={})
                record("Topic generate","PASS" if r.status_code==200 else "FAIL",t,f"status={r.status_code}","-" if r.status_code==200 else error_class(r))
                t=time.perf_counter()
                try:
                    async with client.stream("POST",f"/api/topics/{topic_id}/chat",headers=headers,json={"messages":[{"role":"user","content":"Explain photosynthesis in one sentence."}]}) as sr:
                        body=""
                        async for part in sr.aiter_text():
                            body+=part
                            if '"event":"done"' in body or '"event": "done"' in body: break
                        ok=sr.status_code==200 and '"event":"token"' in body and '"event":"error"' not in body
                        record("Topic chat SSE","PASS" if ok else "FAIL",t,f"status={sr.status_code}","-" if ok else "sse_contract")
                except Exception as exc: record("Topic chat SSE","FAIL",t,type(exc).__name__,"stream_failed")
            else: record("Create temporary topic","FAIL",t,f"status={r.status_code}",error_class(r))
            t=time.perf_counter()
            try:
                r=await client.post("/api/files/upload",headers=headers,files={"file":("notely-ai-smoke.txt",b"Photosynthesis uses sunlight, water, and carbon dioxide to produce sugars and oxygen.","text/plain")})
                if r.status_code==200:
                    file_id=int(r.json()["id"]); record("Upload tiny text file","PASS",t,f"id={file_id}")
                else: record("Upload tiny text file","FAIL",t,f"status={r.status_code}",error_class(r))
            except Exception as exc: record("Upload tiny text file","FAIL",t,type(exc).__name__,"upload_failed")
            if file_id:
                t=time.perf_counter(); r=await client.post(f"/api/files/{file_id}/summarize",headers=headers)
                record("File summarize","PASS" if r.status_code==200 else "FAIL",t,f"status={r.status_code}","-" if r.status_code==200 else error_class(r))
            t=time.perf_counter()
            try:
                async with client.stream("POST",f"/api/chats/{chat_id}/stream",headers=headers,json={"content":"Write a very detailed 1200-word explanation of photosynthesis.","model":"auto"}) as sr:
                    start_seen=False; cancelled=False
                    async for line in sr.aiter_lines():
                        if not line.startswith("data:"): continue
                        try: event=json.loads(line[5:].strip())
                        except json.JSONDecodeError: continue
                        if event.get("event")=="start":
                            start_seen=True; await client.post(f"/api/chats/{chat_id}/cancel",headers=headers)
                        if event.get("event") in ("cancelled","done","error"):
                            cancelled=event.get("event")=="cancelled"; break
                    ok=sr.status_code==200 and start_seen and cancelled
                    record("Explicit stream cancellation","PASS" if ok else "FAIL",t,f"start={start_seen}; cancelled={cancelled}","-" if ok else "cancel_race_or_instance")
            except Exception as exc: record("Explicit stream cancellation","FAIL",t,type(exc).__name__,"cancel_failed")
            # A second stream on the same chat must supersede the first stream.
            t=time.perf_counter()
            try:
                async with client.stream("POST",f"/api/chats/{chat_id}/stream",headers=headers,
                    json={"content":"Write a detailed 1000-word explanation of photosynthesis.","model":"auto"}) as first:
                    first_started=False; first_cancelled=False
                    async for line in first.aiter_lines():
                        if not line.startswith("data:"): continue
                        try: event=json.loads(line[5:].strip())
                        except json.JSONDecodeError: continue
                        if event.get("event")=="start":
                            first_started=True
                            second_task=asyncio.create_task(read_stream(client,chat_id,headers,"Reply only: second stream succeeded.","auto"))
                            break
                    if first_started:
                        async for line in first.aiter_lines():
                            if not line.startswith("data:"): continue
                            try: event=json.loads(line[5:].strip())
                            except json.JSONDecodeError: continue
                            if event.get("event")=="cancelled": first_cancelled=True; break
                            if event.get("event") in ("done","error"): break
                        second_events=await second_task
                        second_ok="done" in [e.get("event") for e in second_events] and "error" not in [e.get("event") for e in second_events]
                        ok=first_started and first_cancelled and second_ok
                    else:
                        ok=False
                record("New stream cancels previous stream","PASS" if ok else "FAIL",t,
                       f"first_cancelled={first_cancelled}","-" if ok else "cancel_race_or_instance")
            except Exception as exc: record("New stream cancels previous stream","FAIL",t,type(exc).__name__,"supersede_failed")
        finally:
            if account_created and token:
                t=time.perf_counter()
                try:
                    r=await client.delete("/api/auth/account",headers={"Authorization":f"Bearer {token}"})
                    ok=r.status_code==200
                    record("Delete temporary test account","PASS" if ok else "FAIL",t,f"status={r.status_code}","-" if ok else "cleanup_failed")
                except Exception as exc: record("Delete temporary test account","FAIL",t,type(exc).__name__,"cleanup_failed")
    await local_provider_unit_tests()
    print(f"\nNotely AI smoke test: {base_url}")
    print("| Test | Result | Latency | Error class | Detail |")
    print("|---|---:|---:|---|---|")
    for row in RESULTS: print(f"| {row['test']} | {row['status']} | {row['latency_ms']} ms | {row['error_class']} | {row['detail']} |")
    failed=sum(r["status"]=="FAIL" for r in RESULTS); skipped=sum(r["status"]=="SKIP" for r in RESULTS)
    print(f"\nSummary: {len(RESULTS)-failed-skipped} passed, {failed} failed, {skipped} skipped.")
    print("Credentials and provider key values are never printed.")
    return 1 if failed else 0

def main():
    parser=argparse.ArgumentParser(description="Notely AI API smoke test")
    parser.add_argument("--base-url",default=os.environ.get("AI_SMOKE_BASE_URL","http://127.0.0.1:3000"))
    parser.add_argument("--diag-token",default=os.environ.get("DIAG_TOKEN"))
    args=parser.parse_args()
    return asyncio.run(run(args.base_url,args.diag_token))
if __name__=="__main__": raise SystemExit(main())
