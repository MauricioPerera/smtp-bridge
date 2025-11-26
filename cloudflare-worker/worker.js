/**
 * Cloudflare Email Worker
 *
 * Receives HTTP POST requests and sends emails using Cloudflare Email Routing.
 * This worker uses the native Cloudflare Email Workers binding.
 *
 * Features:
 *   - Multiple recipients (TO/CC/BCC)
 *   - Attachment support (base64 encoded)
 *   - Reply-To header support
 *   - HTML and plain text content
 *
 * Environment variables (secrets):
 *   - API_KEY: API key for authentication (required)
 *   - SENDER_EMAIL: Default sender email (required)
 *   - DEFAULT_FROM_NAME: Default sender name (optional)
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
            to: ["recipient@example.com"],
            cc: ["cc@example.com"],
            bcc: ["bcc@example.com"],
            subject: "Email subject",
            text: "Plain text body",
            html: "<p>HTML body (optional)</p>",
            from_name: "Sender Name (optional)",
            attachments: [{
              filename: "file.pdf",
              contentType: "application/pdf",
              content: "base64-encoded-content"
            }],
            headers: {
              replyTo: "reply@example.com"
            }
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
      const { to, cc, bcc, subject, text, html, from_name, attachments, headers } = body;

      // Normalize recipients to arrays
      const toList = normalizeRecipients(to);
      const ccList = normalizeRecipients(cc);
      const bccList = normalizeRecipients(bcc);

      // Validate required fields
      if (toList.length === 0) {
        return jsonResponse({ error: "Missing required field: to" }, 400);
      }
      if (!subject) {
        return jsonResponse({ error: "Missing required field: subject" }, 400);
      }
      if (!text && !html) {
        return jsonResponse({ error: "Missing required field: text or html" }, 400);
      }

      // Get sender email from environment
      const senderEmail = env.SENDER_EMAIL || "noreply@example.com";
      const senderName = from_name || env.DEFAULT_FROM_NAME || "System";

      // Track sent emails for response
      const results = [];
      const errors = [];

      // Send to each recipient (Cloudflare Email Routing limitation: one recipient per message)
      // Combine all recipients for individual sending
      const allRecipients = [
        ...toList.map(r => ({ email: r, type: 'to' })),
        ...ccList.map(r => ({ email: r, type: 'cc' })),
        ...bccList.map(r => ({ email: r, type: 'bcc' }))
      ];

      for (const recipient of allRecipients) {
        try {
          // Create MIME message for each recipient
          const msg = createMimeMessage();
          msg.setSender({ name: senderName, addr: senderEmail });
          msg.setRecipient(recipient.email);
          msg.setSubject(subject);

          // Add Reply-To if specified
          if (headers?.replyTo) {
            msg.setHeader("Reply-To", headers.replyTo);
          }

          // Add content
          if (text && html) {
            // Multipart alternative
            msg.addMessage({
              contentType: "text/plain",
              data: text
            });
            msg.addMessage({
              contentType: "text/html",
              data: html
            });
          } else if (html) {
            msg.addMessage({
              contentType: "text/html",
              data: html
            });
          } else {
            msg.addMessage({
              contentType: "text/plain",
              data: text
            });
          }

          // Add attachments
          if (attachments && Array.isArray(attachments)) {
            for (const att of attachments) {
              if (att.filename && att.content) {
                msg.addAttachment({
                  filename: att.filename,
                  contentType: att.contentType || 'application/octet-stream',
                  data: att.content  // Already base64 encoded
                });
              }
            }
          }

          // Create and send email using Cloudflare Email binding
          const message = new EmailMessage(senderEmail, recipient.email, msg.asRaw());
          await env.EMAIL.send(message);

          results.push({
            email: recipient.email,
            type: recipient.type,
            status: 'sent'
          });

        } catch (recipientError) {
          errors.push({
            email: recipient.email,
            type: recipient.type,
            error: recipientError.message
          });
        }
      }

      // Return response
      if (errors.length === 0) {
        return jsonResponse({
          success: true,
          message: `Email sent to ${results.length} recipient(s)`,
          recipients: results,
          subject: subject
        }, 200);
      } else if (results.length > 0) {
        return jsonResponse({
          success: true,
          message: `Email sent to ${results.length} recipient(s), ${errors.length} failed`,
          recipients: results,
          errors: errors,
          subject: subject
        }, 207); // Multi-Status
      } else {
        return jsonResponse({
          success: false,
          error: "All recipients failed",
          errors: errors
        }, 500);
      }

    } catch (error) {
      console.error("Error sending email:", error);
      return jsonResponse({
        success: false,
        error: error.message || "Unknown error"
      }, 500);
    }
  }
};

function normalizeRecipients(recipients) {
  if (!recipients) return [];
  if (typeof recipients === 'string') return [recipients];
  if (Array.isArray(recipients)) return recipients.filter(r => r && typeof r === 'string');
  return [];
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
