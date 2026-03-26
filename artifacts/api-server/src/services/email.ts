import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { logger } from "../lib/logger";

interface SmtpConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpPassword: string;
  smtpSecure: boolean;
}

function createTransporter(config: SmtpConfig): Transporter | null {
  if (!config.smtpHost) {
    logger.warn("SMTP host not configured. Email notifications disabled.");
    return null;
  }

  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: config.smtpUsername
      ? {
          user: config.smtpUsername,
          pass: config.smtpPassword,
        }
      : undefined,
  });
}

export async function sendAlertEmail(
  smtpConfig: SmtpConfig,
  senderEmail: string,
  recipientEmails: string[],
  subject: string,
  htmlBody: string,
  textBody: string
): Promise<boolean> {
  const transporter = createTransporter(smtpConfig);
  if (!transporter) {
    logger.warn("SMTP not configured, skipping email");
    return false;
  }

  if (!senderEmail || recipientEmails.length === 0) {
    logger.warn("No sender or recipient emails configured, skipping");
    return false;
  }

  try {
    await transporter.sendMail({
      from: senderEmail,
      to: recipientEmails.join(", "),
      subject,
      html: htmlBody,
      text: textBody,
    });

    logger.info({ subject, recipients: recipientEmails }, "Alert email sent");
    return true;
  } catch (err) {
    logger.error({ err, subject }, "Failed to send alert email");
    return false;
  }
}

export async function testSmtpConnection(config: SmtpConfig): Promise<{ success: boolean; error?: string }> {
  const transporter = createTransporter(config);
  if (!transporter) {
    return { success: false, error: "SMTP host not configured" };
  }

  try {
    await transporter.verify();
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

export function formatDowntimeAlert(siteName: string, siteUrl: string, statusCode: number | null, errorMessage: string | null): { subject: string; html: string; text: string } {
  const subject = `ALERT: ${siteName} is DOWN`;
  const timestamp = new Date().toISOString();
  const details = errorMessage || `HTTP ${statusCode}`;

  const text = `ALERT: ${siteName} is DOWN\n\nSite: ${siteUrl}\nStatus: ${details}\nTime: ${timestamp}\n\nPlease investigate immediately.`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #DC2626; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">Site Down Alert</h1>
      </div>
      <div style="background: #FEF2F2; padding: 20px; border: 1px solid #FECACA;">
        <p style="font-size: 18px; font-weight: 600; color: #991B1B; margin-top: 0;">${siteName} is not responding</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; color: #666; width: 100px;">Site URL</td><td style="padding: 8px 0; font-weight: 500;">${siteUrl}</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Status</td><td style="padding: 8px 0; font-weight: 500;">${details}</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Time</td><td style="padding: 8px 0; font-weight: 500;">${timestamp}</td></tr>
        </table>
      </div>
      <div style="padding: 16px; background: #F9FAFB; border-radius: 0 0 8px 8px; border: 1px solid #E5E7EB; border-top: 0;">
        <p style="margin: 0; color: #6B7280; font-size: 14px;">Please investigate immediately.</p>
      </div>
    </div>
  `;

  return { subject, html, text };
}

export function formatSlowAlert(siteName: string, siteUrl: string, responseTimeMs: number, thresholdMs: number): { subject: string; html: string; text: string } {
  const subject = `WARNING: ${siteName} is SLOW (${responseTimeMs}ms)`;
  const timestamp = new Date().toISOString();

  const text = `WARNING: ${siteName} is responding slowly\n\nSite: ${siteUrl}\nResponse Time: ${responseTimeMs}ms (threshold: ${thresholdMs}ms)\nTime: ${timestamp}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #D97706; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">Slow Response Alert</h1>
      </div>
      <div style="background: #FFFBEB; padding: 20px; border: 1px solid #FDE68A;">
        <p style="font-size: 18px; font-weight: 600; color: #92400E; margin-top: 0;">${siteName} is responding slowly</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; color: #666; width: 120px;">Site URL</td><td style="padding: 8px 0; font-weight: 500;">${siteUrl}</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Response Time</td><td style="padding: 8px 0; font-weight: 500; color: #D97706;">${responseTimeMs}ms</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Threshold</td><td style="padding: 8px 0; font-weight: 500;">${thresholdMs}ms</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Time</td><td style="padding: 8px 0; font-weight: 500;">${timestamp}</td></tr>
        </table>
      </div>
    </div>
  `;

  return { subject, html, text };
}

export function formatRecoveryAlert(siteName: string, siteUrl: string, responseTimeMs: number): { subject: string; html: string; text: string } {
  const subject = `RECOVERED: ${siteName} is back UP`;
  const timestamp = new Date().toISOString();

  const text = `RECOVERED: ${siteName} is back online\n\nSite: ${siteUrl}\nResponse Time: ${responseTimeMs}ms\nTime: ${timestamp}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #059669; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">Site Recovered</h1>
      </div>
      <div style="background: #ECFDF5; padding: 20px; border: 1px solid #A7F3D0;">
        <p style="font-size: 18px; font-weight: 600; color: #065F46; margin-top: 0;">${siteName} is back online</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; color: #666; width: 120px;">Site URL</td><td style="padding: 8px 0; font-weight: 500;">${siteUrl}</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Response Time</td><td style="padding: 8px 0; font-weight: 500; color: #059669;">${responseTimeMs}ms</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Time</td><td style="padding: 8px 0; font-weight: 500;">${timestamp}</td></tr>
        </table>
      </div>
    </div>
  `;

  return { subject, html, text };
}
