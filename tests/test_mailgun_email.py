"""Unit tests for the Mailgun email transport in backend.routes.users."""
import os
import unittest
from unittest.mock import patch

import httpx
from fastapi import HTTPException

from backend.routes import users


class MailgunEmailTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(
            os.environ,
            {
                "MAILGUN_API_KEY": "test-key",
                "MAILGUN_DOMAIN": "sandbox.example.test",
            },
            clear=True,
        )
        self.env.start()
        self.addCleanup(self.env.stop)
        if hasattr(users._send_email, "_mailgun_warning_logged"):
            delattr(users._send_email, "_mailgun_warning_logged")

    @patch("backend.routes.users.httpx.post")
    def test_success_sends_form_and_basic_auth(self, post):
        post.return_value = httpx.Response(200, json={"message": "Queued. Thank you."})
        users._send_email("authorized@example.test", "Verify Notely", "Your code is 123456.")
        post.assert_called_once()
        args, kwargs = post.call_args
        self.assertEqual(args[0], "https://api.mailgun.net/v3/sandbox.example.test/messages")
        self.assertEqual(kwargs["auth"], ("api", "test-key"))
        self.assertEqual(kwargs["timeout"], 10.0)
        self.assertEqual(kwargs["data"]["from"], "Notely <postmaster@sandbox.example.test>")
        self.assertEqual(kwargs["data"]["to"], "authorized@example.test")
        self.assertIn("123456", kwargs["data"]["text"])
        self.assertIn("123456", kwargs["data"]["html"])
        self.assertIn("Notely", kwargs["data"]["html"])

    @patch("backend.routes.users.httpx.post")
    def test_401_maps_to_safe_503(self, post):
        post.return_value = httpx.Response(401, text="invalid api key")
        with self.assertRaises(HTTPException) as caught:
            users._send_email("authorized@example.test", "subject", "body")
        self.assertEqual(caught.exception.status_code, 503)
        self.assertNotIn("test-key", str(caught.exception.detail))

    @patch("backend.routes.users.httpx.post")
    def test_403_maps_to_authorized_recipient_message(self, post):
        post.return_value = httpx.Response(403, text="not authorized")
        with self.assertRaises(HTTPException) as caught:
            users._send_email("unverified@example.test", "subject", "body")
        self.assertEqual(caught.exception.status_code, 503)
        self.assertIn("address yet", caught.exception.detail)

    @patch("backend.routes.users.httpx.post")
    def test_400_maps_to_retry_message(self, post):
        post.return_value = httpx.Response(400, text="bad request")
        with self.assertRaises(HTTPException) as caught:
            users._send_email("authorized@example.test", "subject", "body")
        self.assertEqual(caught.exception.status_code, 503)
        self.assertEqual(caught.exception.detail, "Could not send email, try again")

    @patch("backend.routes.users.httpx.post")
    def test_timeout_maps_to_retry_message(self, post):
        post.side_effect = httpx.TimeoutException("timed out")
        with self.assertRaises(HTTPException) as caught:
            users._send_email("authorized@example.test", "subject", "body")
        self.assertEqual(caught.exception.status_code, 503)
        self.assertEqual(caught.exception.detail, "Could not send email, try again")

    def test_missing_api_key_is_503(self):
        os.environ.pop("MAILGUN_API_KEY", None)
        with self.assertRaises(HTTPException) as caught:
            users._send_email("authorized@example.test", "subject", "body")
        self.assertEqual(caught.exception.status_code, 503)
        self.assertIn("not configured", caught.exception.detail.lower())

    def test_missing_domain_is_503(self):
        os.environ.pop("MAILGUN_DOMAIN", None)
        with self.assertRaises(HTTPException) as caught:
            users._send_email("authorized@example.test", "subject", "body")
        self.assertEqual(caught.exception.status_code, 503)
        self.assertIn("not configured", caught.exception.detail.lower())


if __name__ == "__main__":
    unittest.main()
