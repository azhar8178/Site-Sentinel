import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { logger } from "../lib/logger";

let sesClient: SESClient | null = null;

function getClient(): SESClient | null {
  if (sesClient) return sesClient;

  const region = process.env.AWS_SES_REGION || process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !accessKeyId || !secretAccessKey) {
    logger.warn("AWS SES credentials not configured. Email notifications disabled.");
    return null;
  }

  sesClient = new SESClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  return sesClient;
}

export async function sendAlertEmail(
  senderEmail: string,
  recipientEmails: string[],
  subject: string,
  htmlBody: string,
  textBody: string
): Promise<boolean> {
  const client = getClient();
  if (!client) {
    logger.warn("SES client not available, skipping email");
    return false;
  }

  if (!senderEmail || recipientEmails.length === 0) {
    logger.warn("No sender or recipient emails configured, skipping");
    return false;
  }

  try {
    const command = new SendEmailCommand({
      Source: senderEmail,
      Destination: {
        ToAddresses: recipientEmails,
      },
      Message: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: htmlBody, Charset: "UTF-8" },
          Text: { Data: textBody, Charset: "UTF-8" },
        },
      },
    });

    await client.send(command);
    logger.info({ subject, recipients: recipientEmails }, "Alert email sent");
    return true;
  } catch (err) {
    logger.error({ err, subject }, "Failed to send alert email");
    return false;
  }
}

export function formatDowntimeAlert(siteName: string, siteUrl: string, statusCode: number | null, errorMessage: string | null): { subject: string; html: string; text: string } {
  const subject = `🚨 ALERT: ${siteName} is DOWN`;
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
  const subject = `⚠️ WARNING: ${siteName} is SLOW (${responseTimeMs}ms)`;
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
  const subject = `✅ RECOVERED: ${siteName} is back UP`;
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
