/**
 * SecureCloud - Zero-Knowledge Encrypted Flie Encryptor for Cloud Storage
 * Copyright (C) 2026 Vladimir Illich Arunan V V
 * 
 * This file is part of SecureCloud.
 * 
 * SecureCloud is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * SecureCloud is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with SecureCloud. If not, see <https://www.gnu.org/licenses/>.
 */

const nodemailer = require('nodemailer');
const crypto = require('crypto');

class EmailService {
    constructor() {
        this.transporter = null;
        this.verificationCodes = new Map(); // Store codes temporarily
    }

    initialize() {
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
            console.warn('⚠️ SMTP credentials not configured. Email sending disabled.');
            return false;
        }

        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        console.log('✅ Email service initialized');
        return true;
    }

    /**
     * Generate a 6-digit verification code
     */
    generateVerificationCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    /**
     * Store verification code with expiry
     */
    storeVerificationCode(email, code, shareId) {
        const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
        this.verificationCodes.set(email.toLowerCase(), {
            code,
            shareId,
            expiresAt,
            attempts: 0
        });
        
        // Auto cleanup after 10 minutes
        setTimeout(() => {
            this.verificationCodes.delete(email.toLowerCase());
        }, 10 * 60 * 1000);
    }

    /**
     * Verify the code
     */
    verifyCode(email, code) {
        const record = this.verificationCodes.get(email.toLowerCase());
        if (!record) {
            return { valid: false, reason: 'No code found or expired' };
        }

        if (record.expiresAt < Date.now()) {
            this.verificationCodes.delete(email.toLowerCase());
            return { valid: false, reason: 'Code expired' };
        }

        record.attempts++;
        
        if (record.attempts > 5) {
            this.verificationCodes.delete(email.toLowerCase());
            return { valid: false, reason: 'Too many attempts' };
        }

        if (record.code !== code) {
            return { valid: false, reason: 'Invalid code' };
        }

        // Valid code - return shareId and clean up
        const shareId = record.shareId;
        this.verificationCodes.delete(email.toLowerCase());
        
        return { valid: true, shareId };
    }

    /**
     * Send verification email
     */
    async sendVerificationEmail(toEmail, code, fileName, senderEmail) {
        if (!this.transporter) {
            console.error('Email service not initialized');
            return { success: false, error: 'Email service not configured' };
        }

        const mailOptions = {
            from: `"SecureCloud" <${process.env.SMTP_USER}>`,
            to: toEmail,
            subject: 'Secure File Share Verification Code',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
                    <h2 style="color: #2563eb;">Secure File Share</h2>
                    <p style="font-size: 16px; color: #333;">
                        <strong>${senderEmail}</strong> has shared a file with you: <strong>${fileName}</strong>
                    </p>
                    <p style="font-size: 16px; color: #333;">
                        Your verification code is:
                    </p>
                    <div style="background-color: #f3f4f6; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
                        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2563eb;">${code}</span>
                    </div>
                    <p style="font-size: 14px; color: #666;">
                        This code will expire in 10 minutes. Do not share this code with anyone.
                    </p>
                    <p style="font-size: 14px; color: #999; margin-top: 30px;">
                        If you didn't request this code, please ignore this email.
                    </p>
                </div>
            `
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            console.log(`✅ Verification email sent to ${toEmail}:`, info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('❌ Failed to send email:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Clean up expired codes
     */
    cleanup() {
        const now = Date.now();
        for (const [email, record] of this.verificationCodes.entries()) {
            if (record.expiresAt < now) {
                this.verificationCodes.delete(email);
            }
        }
    }
}

module.exports = new EmailService();