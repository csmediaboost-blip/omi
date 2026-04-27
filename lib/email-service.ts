import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

interface PaymentReceiptEmail {
  email: string;
  userName: string;
  amount: number;
  planName: string;
  planTerm: string;
  transactionId: string;
  date: Date;
  estimatedReturns: string;
}

interface WithdrawalReceiptEmail {
  email: string;
  userName: string;
  amount: number;
  withdrawalId: string;
  status: "initiated" | "processing" | "completed";
  expectedDateRange?: string;
  bankDetails?: string;
  date: Date;
}

interface AccountSecurityEmail {
  email: string;
  userName: string;
  eventType: "login" | "pin_changed" | "payout_changed" | "withdrawal_initiated" | "failed_login";
  location?: string;
  timestamp: Date;
  ipAddress?: string;
}

interface WelcomeEmail {
  email: string;
  userName: string;
  signupDate: Date;
}

/**
 * Send payment receipt email
 */
export async function sendPaymentReceipt(data: PaymentReceiptEmail) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[EMAIL] RESEND_API_KEY not configured, skipping email");
    return { success: false, reason: "Email service not configured" };
  }

  try {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; color: #333; background: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
            .header { border-bottom: 2px solid #10b981; padding-bottom: 15px; margin-bottom: 20px; }
            .header h1 { margin: 0; color: #000; font-size: 24px; }
            .header p { margin: 5px 0 0 0; color: #666; font-size: 14px; }
            .receipt-detail { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #eee; }
            .receipt-label { color: #666; }
            .receipt-value { font-weight: bold; color: #000; }
            .amount { font-size: 28px; color: #10b981; font-weight: bold; margin: 15px 0; }
            .footer { margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; font-size: 12px; color: #999; }
            .button { display: inline-block; margin-top: 15px; padding: 10px 20px; background: #10b981; color: white; text-decoration: none; border-radius: 4px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Payment Confirmed</h1>
              <p>${data.date.toLocaleDateString()}</p>
            </div>
            
            <p>Hi ${data.userName},</p>
            <p>Your payment has been successfully processed. Here are your receipt details:</p>
            
            <div class="receipt-detail">
              <span class="receipt-label">Transaction ID:</span>
              <span class="receipt-value">${data.transactionId}</span>
            </div>
            <div class="receipt-detail">
              <span class="receipt-label">Plan:</span>
              <span class="receipt-value">${data.planName} (${data.planTerm})</span>
            </div>
            <div class="receipt-detail">
              <span class="receipt-label">Amount Paid:</span>
              <span class="receipt-value">$${data.amount.toFixed(2)}</span>
            </div>
            <div class="receipt-detail">
              <span class="receipt-label">Estimated Returns:</span>
              <span class="receipt-value">${data.estimatedReturns}</span>
            </div>
            
            <p style="margin-top: 25px;">
              <a href="https://omnitask.pro/dashboard" class="button">View Your Dashboard</a>
            </p>
            
            <div class="footer">
              <p>This receipt serves as proof of your transaction. Keep it for your records.</p>
              <p>Questions? Visit our help center or contact support@omnitask.pro</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const result = await resend.emails.send({
      from: "OmniTask Pro <noreply@omnitask.pro>",
      to: data.email,
      subject: `Payment Receipt - $${data.amount.toFixed(2)} ${data.transactionId}`,
      html: htmlContent,
    });

    if (result.error) {
      console.error("[EMAIL] Failed to send payment receipt:", result.error);
      return { success: false, reason: result.error.message };
    }

    console.log(`[EMAIL] Payment receipt sent to ${data.email}`);
    return { success: true, emailId: result.data?.id };
  } catch (error: any) {
    console.error("[EMAIL] Error sending payment receipt:", error);
    return { success: false, reason: error.message };
  }
}

/**
 * Send withdrawal receipt email
 */
export async function sendWithdrawalReceipt(data: WithdrawalReceiptEmail) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[EMAIL] RESEND_API_KEY not configured, skipping email");
    return { success: false, reason: "Email service not configured" };
  }

  try {
    const statusText =
      data.status === "initiated"
        ? "Your withdrawal has been initiated and is being processed."
        : data.status === "processing"
          ? "Your withdrawal is being processed and will arrive shortly."
          : "Your withdrawal has been completed successfully.";

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; color: #333; background: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
            .header { border-bottom: 2px solid #10b981; padding-bottom: 15px; margin-bottom: 20px; }
            .header h1 { margin: 0; color: #000; font-size: 24px; }
            .status { padding: 12px; background: #f0fdf4; border-left: 4px solid #10b981; margin: 15px 0; }
            .status p { margin: 0; }
            .receipt-detail { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #eee; }
            .receipt-label { color: #666; }
            .receipt-value { font-weight: bold; color: #000; }
            .amount { font-size: 28px; color: #10b981; font-weight: bold; margin: 15px 0; }
            .footer { margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; font-size: 12px; color: #999; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Withdrawal ${data.status === "completed" ? "Completed" : "Initiated"}</h1>
            </div>
            
            <p>Hi ${data.userName},</p>
            
            <div class="status">
              <p>${statusText}</p>
            </div>
            
            <div class="receipt-detail">
              <span class="receipt-label">Withdrawal ID:</span>
              <span class="receipt-value">${data.withdrawalId}</span>
            </div>
            <div class="receipt-detail">
              <span class="receipt-label">Amount:</span>
              <span class="receipt-value">$${data.amount.toFixed(2)}</span>
            </div>
            ${data.expectedDateRange ? `
            <div class="receipt-detail">
              <span class="receipt-label">Expected Delivery:</span>
              <span class="receipt-value">${data.expectedDateRange}</span>
            </div>
            ` : ""}
            ${data.bankDetails ? `
            <div class="receipt-detail">
              <span class="receipt-label">Destination:</span>
              <span class="receipt-value">${data.bankDetails}</span>
            </div>
            ` : ""}
            
            <p style="margin-top: 25px;">
              Track your withdrawal status in your dashboard or contact support if you have questions.
            </p>
            
            <div class="footer">
              <p>Questions? Visit our help center or contact support@omnitask.pro</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const result = await resend.emails.send({
      from: "OmniTask Pro <noreply@omnitask.pro>",
      to: data.email,
      subject: `Withdrawal ${data.status === "completed" ? "Completed" : "Initiated"} - ${data.withdrawalId}`,
      html: htmlContent,
    });

    if (result.error) {
      console.error("[EMAIL] Failed to send withdrawal receipt:", result.error);
      return { success: false, reason: result.error.message };
    }

    console.log(`[EMAIL] Withdrawal receipt sent to ${data.email}`);
    return { success: true, emailId: result.data?.id };
  } catch (error: any) {
    console.error("[EMAIL] Error sending withdrawal receipt:", error);
    return { success: false, reason: error.message };
  }
}

/**
 * Send account security alert email
 */
export async function sendSecurityAlert(data: AccountSecurityEmail) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[EMAIL] RESEND_API_KEY not configured, skipping email");
    return { success: false, reason: "Email service not configured" };
  }

  try {
    const eventDescriptions: Record<string, string> = {
      login: `New login detected`,
      pin_changed: `Your PIN was changed`,
      payout_changed: `Your payout account was updated`,
      withdrawal_initiated: `A withdrawal request was initiated`,
      failed_login: `Failed login attempt detected`,
    };

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; color: #333; background: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
            .header { border-bottom: 2px solid #f59e0b; padding-bottom: 15px; margin-bottom: 20px; }
            .header h1 { margin: 0; color: #000; font-size: 24px; }
            .alert { padding: 12px; background: ${data.eventType === "failed_login" ? "#fef2f2" : "#fffbeb"}; border-left: 4px solid ${data.eventType === "failed_login" ? "#ef4444" : "#f59e0b"}; margin: 15px 0; }
            .detail { padding: 8px 0; border-bottom: 1px solid #eee; }
            .detail-label { color: #666; font-size: 12px; text-transform: uppercase; }
            .detail-value { color: #000; font-weight: bold; }
            .footer { margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; font-size: 12px; color: #999; }
            .button { display: inline-block; margin-top: 15px; padding: 10px 20px; background: #ef4444; color: white; text-decoration: none; border-radius: 4px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Security Alert</h1>
            </div>
            
            <p>Hi ${data.userName},</p>
            
            <div class="alert">
              <p><strong>${eventDescriptions[data.eventType]}</strong></p>
            </div>
            
            <div class="detail">
              <div class="detail-label">Event:</div>
              <div class="detail-value">${eventDescriptions[data.eventType]}</div>
            </div>
            <div class="detail">
              <div class="detail-label">Time:</div>
              <div class="detail-value">${data.timestamp.toLocaleString()}</div>
            </div>
            ${data.location ? `
            <div class="detail">
              <div class="detail-label">Location:</div>
              <div class="detail-value">${data.location}</div>
            </div>
            ` : ""}
            ${data.ipAddress ? `
            <div class="detail">
              <div class="detail-label">IP Address:</div>
              <div class="detail-value">${data.ipAddress}</div>
            </div>
            ` : ""}
            
            <p style="margin-top: 25px;">
              <strong>Did you authorize this action?</strong> If not, please secure your account immediately.
            </p>
            
            <p>
              <a href="https://omnitask.pro/dashboard/security" class="button">Review Account Security</a>
            </p>
            
            <div class="footer">
              <p>For security reasons, we never ask for passwords via email. Report suspicious activity to security@omnitask.pro</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const result = await resend.emails.send({
      from: "OmniTask Pro Security <security@omnitask.pro>",
      to: data.email,
      subject: `Security Alert: ${eventDescriptions[data.eventType]}`,
      html: htmlContent,
    });

    if (result.error) {
      console.error("[EMAIL] Failed to send security alert:", result.error);
      return { success: false, reason: result.error.message };
    }

    console.log(`[EMAIL] Security alert sent to ${data.email}`);
    return { success: true, emailId: result.data?.id };
  } catch (error: any) {
    console.error("[EMAIL] Error sending security alert:", error);
    return { success: false, reason: error.message };
  }
}

/**
 * Send welcome email to new user
 */
export async function sendWelcomeEmail(data: WelcomeEmail) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[EMAIL] RESEND_API_KEY not configured, skipping email");
    return { success: false, reason: "Email service not configured" };
  }

  try {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; color: #333; background: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
            .header { border-bottom: 2px solid #10b981; padding-bottom: 15px; margin-bottom: 20px; }
            .header h1 { margin: 0; color: #000; font-size: 24px; }
            .step { margin: 20px 0; padding: 15px; background: #f0fdf4; border-left: 4px solid #10b981; }
            .step h3 { margin: 0 0 8px 0; color: #065f46; }
            .button { display: inline-block; margin-top: 15px; padding: 10px 20px; background: #10b981; color: white; text-decoration: none; border-radius: 4px; }
            .footer { margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; font-size: 12px; color: #999; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to OmniTask Pro!</h1>
            </div>
            
            <p>Hi ${data.userName},</p>
            <p>Thank you for joining OmniTask Pro. You're now part of a global network earning from enterprise AI GPU computing.</p>
            
            <div class="step">
              <h3>1️⃣ Complete Your Profile</h3>
              <p>Verify your email and phone number for account security. This takes 2 minutes.</p>
            </div>
            
            <div class="step">
              <h3>2️⃣ Set Up Your Payout Account</h3>
              <p>Add your bank or payment method so earnings can be transferred to you.</p>
            </div>
            
            <div class="step">
              <h3>3️⃣ Make Your First Investment</h3>
              <p>Start with a GPU node (minimum $5). Earnings begin accruing immediately.</p>
            </div>
            
            <p>
              <a href="https://omnitask.pro/dashboard" class="button">Go to Dashboard</a>
            </p>
            
            <p>Questions? Check out our <a href="https://omnitask.pro/help">help center</a> or <a href="https://omnitask.pro/dashboard/support">contact support</a>.</p>
            
            <div class="footer">
              <p>Welcome aboard! We&apos;re excited to have you.</p>
              <p>OmniTask Pro Team</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const result = await resend.emails.send({
      from: "OmniTask Pro <welcome@omnitask.pro>",
      to: data.email,
      subject: "Welcome to OmniTask Pro! Get Started in 3 Steps",
      html: htmlContent,
    });

    if (result.error) {
      console.error("[EMAIL] Failed to send welcome email:", result.error);
      return { success: false, reason: result.error.message };
    }

    console.log(`[EMAIL] Welcome email sent to ${data.email}`);
    return { success: true, emailId: result.data?.id };
  } catch (error: any) {
    console.error("[EMAIL] Error sending welcome email:", error);
    return { success: false, reason: error.message };
  }
}
