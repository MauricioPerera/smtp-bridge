#!/usr/bin/env node
/**
 * Test script for SMTP to Webhook Bridge
 *
 * Usage:
 *   node scripts/test-smtp.js [recipient-email]
 *
 * Environment:
 *   SMTP_HOST - SMTP server host (default: 127.0.0.1)
 *   SMTP_PORT - SMTP server port (default: 2525)
 */

const nodemailer = require('nodemailer');

const config = {
  host: process.env.SMTP_HOST || '127.0.0.1',
  port: parseInt(process.env.SMTP_PORT || '2525'),
  recipient: process.argv[2] || 'test@example.com'
};

console.log('');
console.log('SMTP Bridge Test');
console.log('================');
console.log(`Server: ${config.host}:${config.port}`);
console.log(`Recipient: ${config.recipient}`);
console.log('');

const transporter = nodemailer.createTransport({
  host: config.host,
  port: config.port,
  secure: false,
  tls: {
    rejectUnauthorized: false
  }
});

const mailOptions = {
  from: 'Test <test@example.com>',
  to: config.recipient,
  subject: `SMTP Bridge Test - ${new Date().toISOString()}`,
  text: 'This is a test email sent through the SMTP to Webhook bridge.',
  html: `
    <h2>SMTP Bridge Test</h2>
    <p>This is a test email sent through the SMTP to Webhook bridge.</p>
    <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
    <hr>
    <p><em>If you received this email, the bridge is working correctly!</em></p>
  `
};

console.log('Sending test email...');

transporter.sendMail(mailOptions)
  .then(info => {
    console.log('');
    console.log('✓ Email sent successfully!');
    console.log(`  Response: ${info.response}`);
    console.log('');
  })
  .catch(err => {
    console.log('');
    console.error('✗ Failed to send email:');
    console.error(`  ${err.message}`);
    console.log('');
    process.exit(1);
  });
