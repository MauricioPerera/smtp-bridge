/**
 * Cloudflare Email Worker
 *
 * Receives HTTP POST requests and sends emails using Cloudflare Email Routing.
 * This worker uses the native Cloudflare Email Workers binding.
 *
 * Environment variables (secrets):
 *   - API_KEY: API key for authentication (required)
 *
 * Bindings (wrangler.toml):
 *   - EMAIL: send_email binding
 */

import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext";

export default {
  async fetch(request, env) {
    // CORS headers for preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-API-Key"
        }
      });
    }

    // Only allow POST requests
    if (request.method !== "POST") {
      return jsonResponse({
        error: "Method not allowed. Use POST.",
        usage: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": "your-api-key"
          },
          body: {
            to: "recipient@example.com",
            subject: "Email subject",
            text: "Plain text body",
            html: "<p>HTML body (optional)</p>",
            from_name: "Sender Name (optional)"
          }
        }
      }, 405);
    }

    // Verify API key
    const apiKey = request.headers.get("X-API-Key");
    if (!apiKey || apiKey !== env.API_KEY) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    try {
      const body = await request.json();
      const { to, subject, text, html, from_name } = body;

      // Validate required fields
      if (!to) {
        return jsonResponse({ error: "Missing required field: to" }, 400);
      }
      if (!subject) {
        return jsonResponse({ error: "Missing required field: subject" }, 400);
      }
      if (!text && !html) {
        return jsonResponse({ error: "Missing required field: text or html" }, 400);
      }

      // Get sender email from environment or use default
      const senderEmail = env.SENDER_EMAIL || "noreply@example.com";
      const senderName = from_name || env.DEFAULT_FROM_NAME || "System";

      // Create MIME message
      const msg = createMimeMessage();
      msg.setSender({ name: senderName, addr: senderEmail });
      msg.setRecipient(to);
      msg.setSubject(subject);

      // Add content
      if (text) {
        msg.addMessage({
          contentType: "text/plain",
          data: text
        });
      }
      if (html) {
        msg.addMessage({
          contentType: "text/html",
          data: html
        });
      }

      // Create and send email using Cloudflare Email binding
      const message = new EmailMessage(senderEmail, to, msg.asRaw());
      await env.EMAIL.send(message);

      return jsonResponse({
        success: true,
        message: "Email sent successfully",
        to: to,
        subject: subject
      }, 200);

    } catch (error) {
      console.error("Error sending email:", error);
      return jsonResponse({
        success: false,
        error: error.message || "Unknown error"
      }, 500);
    }
  }
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
