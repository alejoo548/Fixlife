import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'fixlifeworks@gmail.com',
    pass: 'annk vbyh ppne ssfy',
  },
});

export const sendVerificationEmail = async (to: string, otp: string, name: string) => {
  const mailOptions = {
    from: '"Fixlife Support" <fixlifeworks@gmail.com>',
    to,
    subject: 'Your Fixlife Verification Code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #ff6b00; padding: 20px; text-align: center;">
          <h2 style="color: #ffffff; margin: 0;">Welcome to Fixlife Pros!</h2>
        </div>
        <div style="padding: 20px; color: #333333;">
          <p>Hi ${name},</p>
          <p>Thank you for joining Fixlife as a Pro. Please use the verification code below to complete your registration:</p>
          <div style="margin: 30px 0; text-align: center;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #ff6b00; background-color: #fff4e6; padding: 15px 25px; border-radius: 8px;">${otp}</span>
          </div>
          <p style="font-size: 14px; color: #666666;">This code is valid for 15 minutes.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <br>
          <p>Best regards,<br>The Fixlife Team</p>
        </div>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Verification email sent: %s', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending verification email:', error);
    return false;
  }
};

export const sendEmailChangeToken = async (to: string, otp: string, name: string) => {
  const mailOptions = {
    from: '"Fixlife Support" <fixlifeworks@gmail.com>',
    to,
    subject: 'Fixlife - Verify Your New Email',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;">
        <div style="background-color: #ff6b00; padding: 20px; text-align: center;">
          <h2 style="color: #ffffff; margin: 0; font-size: 30px;">Fixlife</h2>
        </div>
        <div style="padding: 24px; color: #333333; background: #ffffff;">
          <p>Hi ${name},</p>
          <p>We received a request to change your email in Fixlife. Use this code to verify your new email address:</p>
          <div style="margin: 28px 0; text-align: center;">
            <span style="font-size: 34px; font-weight: bold; letter-spacing: 7px; color: #ff6b00; background-color: #fff4e6; padding: 16px 26px; border-radius: 10px;">${otp}</span>
          </div>
          <p style="font-size: 14px; color: #666666;">This code is valid for 15 minutes.</p>
          <p>If you didn't request this change, ignore this email and secure your account.</p>
          <br>
          <p>Best regards,<br>The Fixlife Team</p>
        </div>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email change token sent: %s', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending email change token:', error);
    return false;
  }
};

export const sendProfileChangeNotice = async (
  to: string,
  name: string,
  changes: string[]
) => {
  const changeItems = changes.map((change) => `<li>${change}</li>`).join('');
  const mailOptions = {
    from: '"Fixlife Security" <fixlifeworks@gmail.com>',
    to,
    subject: 'Fixlife Account Changes Detected',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #111827; padding: 20px; text-align: center;">
          <h2 style="color: #ffffff; margin: 0;">Account Update Notification</h2>
        </div>
        <div style="padding: 20px; color: #111827;">
          <p>Hi ${name},</p>
          <p>These changes were made to your Fixlife account:</p>
          <ul>${changeItems}</ul>
          <p style="font-size: 14px; color: #4b5563;">If this wasn't you, reset your password immediately.</p>
          <p>Fixlife Team</p>
        </div>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Profile change notice sent: %s', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending profile change notice:', error);
    return false;
  }
};
