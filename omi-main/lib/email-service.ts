"use server";

import { Resend } from "resend";

// Lazy-load Resend client to avoid issues during build time
function getResendClient() {
  return new Resend(process.env.RESEND_API_KEY || "");
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "noreply@omnitask.pro";

// ────────────────────────────────────────────────────────────────
// GPU Node Investment Receipt
// ────────────────────────────────────────────────────────────────
export async function sendGPUInvestmentReceipt(
  email: string,
  userName: string,
  amount: number,
  currency: string,
  nodeKey: string,
  lockInMonths: number,
  transactionId: string,
  createdAt: string
): Promise<boolean> {
  try {
    const resend = getResendClient();
    const formattedAmount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(amount);

    const lockInDate = new Date();
    lockInDate.setMonth(lockInDate.getMonth() + lockInMonths);
    const formattedLockInDate = lockInDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #333; line-height: 1.6; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .receipt-item { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
            .receipt-item.total { font-weight: bold; color: #10b981; border-bottom: none; padding-top: 12px; }
            .badge { display: inline-block; background: #dbeafe; color: #0369a1; padding: 6px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; margin-top: 10px; }
            .cta { text-align: center; margin-top: 20px; }
            .cta a { display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #666; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Payment Receipt</h1>
              <p>GPU Node Investment Confirmed</p>
            </div>
            <div class="content">
              <p>Hi <strong>${userName}</strong>,</p>
              <p>Your GPU node investment has been successfully processed. Here are your receipt details:</p>
              
              <div style="background: white; padding: 20px; border-radius: 6px; margin: 20px 0;">
                <div class="receipt-item">
                  <span>Transaction ID:</span>
                  <strong>${transactionId}</strong>
                </div>
                <div class="receipt-item">
                  <span>Node Plan:</span>
                  <strong>${nodeKey}</strong>
                </div>
                <div class="receipt-item">
                  <span>Investment Amount:</span>
                  <strong>${formattedAmount}</strong>
                </div>
                <div class="receipt-item">
                  <span>Lock-in Period:</span>
                  <strong>${lockInMonths} months</strong>
                </div>
                <div class="receipt-item">
                  <span>Lock-in Until:</span>
                  <strong>${formattedLockInDate}</strong>
                </div>
                <div class="receipt-item">
                  <span>Payment Date:</span>
                  <strong>${new Date(createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</strong>
                </div>
                <div class="receipt-item total">
                  <span>Status:</span>
                  <span style="color: #10b981;">✓ Confirmed</span>
                </div>
              </div>

              <div style="background: #eff6ff; padding: 16px; border-left: 4px solid #10b981; border-radius: 4px; margin: 20px 0;">
                <strong>What's Next?</strong>
                <ul style="margin: 10px 0; padding-left: 20px;">
                  <li>Your GPU node is now active and earning rewards</li>
                  <li>You can monitor your earnings in your dashboard</li>
                  <li>Withdrawals available after the ${lockInMonths}-month lock-in period</li>
                </ul>
              </div>

              <div class="cta">
                <a href="https://omnitask.pro/dashboard/financials">View Your Dashboard</a>
              </div>

              <div class="footer">
                <p>If you have any questions, please contact our support team at support@omnitask.pro</p>
                <p>© 2026 OmniTask Pro. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `GPU Node Investment Receipt - ${transactionId}`,
      html,
    });

    console.log("[v0] GPU investment receipt sent to:", email);
    return true;
  } catch (error) {
    console.error("[v0] Error sending GPU investment receipt:", error);
    return false;
  }
}

// ────────────────────────────────────────────────────────────────
// License Payment Receipt
// ────────────────────────────────────────────────────────────────
export async function sendLicenseReceipt(
  email: string,
  userName: string,
  amount: number,
  currency: string,
  licenseType: string,
  validUntil: string,
  transactionId: string,
  createdAt: string
): Promise<boolean> {
  try {
    const resend = getResendClient();
    const formattedAmount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(amount);

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #333; line-height: 1.6; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .receipt-item { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
            .receipt-item.total { font-weight: bold; color: #8b5cf6; border-bottom: none; padding-top: 12px; }
            .cta { text-align: center; margin-top: 20px; }
            .cta a { display: inline-block; background: #8b5cf6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #666; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Payment Receipt</h1>
              <p>License Activated</p>
            </div>
            <div class="content">
              <p>Hi <strong>${userName}</strong>,</p>
              <p>Your operator license payment has been successfully processed. You now have full access to OmniTask Pro. Here are your receipt details:</p>
              
              <div style="background: white; padding: 20px; border-radius: 6px; margin: 20px 0;">
                <div class="receipt-item">
                  <span>Transaction ID:</span>
                  <strong>${transactionId}</strong>
                </div>
                <div class="receipt-item">
                  <span>License Type:</span>
                  <strong>${licenseType}</strong>
                </div>
                <div class="receipt-item">
                  <span>License Fee:</span>
                  <strong>${formattedAmount}</strong>
                </div>
                <div class="receipt-item">
                  <span>Valid Until:</span>
                  <strong>${new Date(validUntil).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</strong>
                </div>
                <div class="receipt-item">
                  <span>Monthly Infrastructure:</span>
                  <strong>$5.00/month</strong>
                </div>
                <div class="receipt-item">
                  <span>Payment Date:</span>
                  <strong>${new Date(createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</strong>
                </div>
                <div class="receipt-item total">
                  <span>Status:</span>
                  <span style="color: #8b5cf6;">✓ Activated</span>
                </div>
              </div>

              <div style="background: #f3e8ff; padding: 16px; border-left: 4px solid #8b5cf6; border-radius: 4px; margin: 20px 0;">
                <strong>Your License Includes:</strong>
                <ul style="margin: 10px 0; padding-left: 20px;">
                  <li>Access to GPU node plans</li>
                  <li>Real-time earnings tracking</li>
                  <li>Monthly infrastructure support</li>
                  <li>Priority customer support</li>
                </ul>
              </div>

              <div class="cta">
                <a href="https://omnitask.pro/dashboard/gpu-plans">Start Investing</a>
              </div>

              <div class="footer">
                <p>If you have any questions, please contact our support team at support@omnitask.pro</p>
                <p>© 2026 OmniTask Pro. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `License Activation Receipt - ${transactionId}`,
      html,
    });

    console.log("[v0] License receipt sent to:", email);
    return true;
  } catch (error) {
    console.error("[v0] Error sending license receipt:", error);
    return false;
  }
}

// ────────────────────────────────────────────────────────────────
// Crypto Payment Receipt
// ────────────────────────────────────────────────────────────────
export async function sendCryptoPaymentReceipt(
  email: string,
  userName: string,
  cryptoAmount: number,
  cryptoType: string,
  usdEquivalent: number,
  walletAddress: string,
  transactionHash: string,
  nodeKey: string,
  transactionId: string,
  approvedAt: string
): Promise<boolean> {
  try {
    const resend = getResendClient();
    const formattedUSD = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(usdEquivalent);

    // Generate blockchain explorer link based on crypto type
    let explorerLink = "#";
    if (cryptoType.toUpperCase() === "BTC") {
      explorerLink = `https://blockchain.info/tx/${transactionHash}`;
    } else if (cryptoType.toUpperCase() === "ETH") {
      explorerLink = `https://etherscan.io/tx/${transactionHash}`;
    } else if (cryptoType.toUpperCase().includes("USDT")) {
      explorerLink = `https://etherscan.io/tx/${transactionHash}`;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #333; line-height: 1.6; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .receipt-item { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
            .receipt-item.total { font-weight: bold; color: #f59e0b; border-bottom: none; padding-top: 12px; }
            .mono { font-family: "Monaco", "Courier New", monospace; font-size: 12px; word-break: break-all; }
            .cta { text-align: center; margin-top: 20px; }
            .cta a { display: inline-block; background: #f59e0b; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; }
            .explorer-link { display: inline-block; background: #ffe4b5; color: #d97706; padding: 6px 12px; border-radius: 4px; text-decoration: none; font-size: 12px; font-weight: 600; margin-top: 10px; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #666; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Payment Receipt</h1>
              <p>Crypto Payment Approved & Confirmed</p>
            </div>
            <div class="content">
              <p>Hi <strong>${userName}</strong>,</p>
              <p>Your crypto payment has been reviewed and approved by our admin team. Your investment is now confirmed. Here are your receipt details:</p>
              
              <div style="background: white; padding: 20px; border-radius: 6px; margin: 20px 0;">
                <div class="receipt-item">
                  <span>Transaction ID:</span>
                  <strong>${transactionId}</strong>
                </div>
                <div class="receipt-item">
                  <span>Crypto Received:</span>
                  <strong>${cryptoAmount} ${cryptoType.toUpperCase()}</strong>
                </div>
                <div class="receipt-item">
                  <span>USD Equivalent:</span>
                  <strong>${formattedUSD}</strong>
                </div>
                <div class="receipt-item">
                  <span>Node Plan:</span>
                  <strong>${nodeKey}</strong>
                </div>
                <div class="receipt-item">
                  <span>Approval Date:</span>
                  <strong>${new Date(approvedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</strong>
                </div>
                <div class="receipt-item total">
                  <span>Status:</span>
                  <span style="color: #f59e0b;">✓ Approved & Confirmed</span>
                </div>
              </div>

              <div style="background: #fef3c7; padding: 16px; border-left: 4px solid #f59e0b; border-radius: 4px; margin: 20px 0;">
                <strong>Blockchain Verification</strong>
                <p style="margin: 10px 0; font-size: 12px;">Transaction Hash:</p>
                <p class="mono" style="background: white; padding: 10px; border-radius: 4px; margin: 10px 0;">${transactionHash}</p>
                <p style="margin: 10px 0; font-size: 12px;">Receiving Wallet:</p>
                <p class="mono" style="background: white; padding: 10px; border-radius: 4px;">${walletAddress}</p>
                <a href="${explorerLink}" class="explorer-link" target="_blank">View on Block Explorer</a>
              </div>

              <div style="background: #f0fdf4; padding: 16px; border-left: 4px solid #10b981; border-radius: 4px; margin: 20px 0;">
                <strong>What's Next?</strong>
                <ul style="margin: 10px 0; padding-left: 20px;">
                  <li>Your node is now active and earning rewards</li>
                  <li>Monitor your earnings in real-time on your dashboard</li>
                  <li>View this receipt anytime in your transaction history</li>
                </ul>
              </div>

              <div class="cta">
                <a href="https://omnitask.pro/dashboard/financials">View Your Dashboard</a>
              </div>

              <div class="footer">
                <p>If you have any questions, please contact our support team at support@omnitask.pro</p>
                <p>© 2026 OmniTask Pro. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `Crypto Payment Receipt - ${transactionId}`,
      html,
    });

    console.log("[v0] Crypto payment receipt sent to:", email);
    return true;
  } catch (error) {
    console.error("[v0] Error sending crypto payment receipt:", error);
    return false;
  }
}
