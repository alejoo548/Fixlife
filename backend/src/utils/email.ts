import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASS || '',
  },
});

export const sendVerificationEmail = async (to: string, otp: string, name: string) => {
  const mailOptions = {
    from: `"Fixlife Support" <${process.env.EMAIL_USER || 'no-reply@fixlife.local'}>`,
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
    from: `"Fixlife Support" <${process.env.EMAIL_USER || 'no-reply@fixlife.local'}>`,
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
    from: `"Fixlife Security" <${process.env.EMAIL_USER || 'no-reply@fixlife.local'}>`,
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

export const sendPasswordResetEmail = async (to: string, otp: string, name: string) => {
  const mailOptions = {
    from: `"Fixlife Support" <${process.env.EMAIL_USER || 'no-reply@fixlife.local'}>`,
    to,
    subject: 'Reset Your Fixlife Password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0090FF; padding: 20px; text-align: center;">
          <h2 style="color: #ffffff; margin: 0;">Password Reset Request</h2>
        </div>
        <div style="padding: 20px; color: #333333;">
          <p>Hi ${name},</p>
          <p>We received a request to reset your Fixlife password. Use the verification code below to continue:</p>
          <div style="margin: 30px 0; text-align: center;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #0090FF; background-color: #e6f4ff; padding: 15px 25px; border-radius: 8px;">${otp}</span>
          </div>
          <p style="font-size: 14px; color: #666666;">This code is valid for 15 minutes.</p>
          <p>If you didn't request this password reset, please ignore this email and your password will remain unchanged.</p>
          <br>
          <p>Best regards,<br>The Fixlife Team</p>
        </div>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent: %s', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return false;
  }
};

type PaymentInvoiceInput = {
  to: string;
  customerName: string;
  requestId: number;
  serviceName: string;
  amount: number;
  platformFee: number;
  workerPayout: number;
  checkoutReference: string;
  invoiceNumber: string;
  provider: string;
  paidAt: Date;
};

export const sendPaymentInvoiceEmail = async (input: PaymentInvoiceInput) => {
  const paidDate = input.paidAt.toLocaleString('es-SV', { hour12: true });
  const subtotal = Number(Math.max(input.amount - input.platformFee, 0).toFixed(2));
  const mailOptions = {
    from: `"Fixlife Billing" <${process.env.EMAIL_USER || 'no-reply@fixlife.local'}>`,
    to: input.to,
    subject: `Factura Electronica Fixlife - ${input.invoiceNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #003087, #0070ba); padding: 22px; color: white;">
          <h2 style="margin: 0; font-size: 24px;">Factura Electronica</h2>
          <p style="margin: 8px 0 0; opacity: 0.92;">Fixlife payment receipt</p>
        </div>
        <div style="padding: 22px; color: #111827;">
          <p>Hola ${input.customerName},</p>
          <p>Tu pago ha sido procesado con exito. Aqui tienes el comprobante electronico de tu servicio:</p>
          <div style="margin: 16px 0; padding: 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
            <p style="margin: 0 0 6px;"><strong>Factura:</strong> ${input.invoiceNumber}</p>
            <p style="margin: 0 0 6px;"><strong>Solicitud:</strong> #${input.requestId}</p>
            <p style="margin: 0 0 6px;"><strong>Servicio:</strong> ${input.serviceName}</p>
            <p style="margin: 0 0 6px;"><strong>Referencia:</strong> ${input.checkoutReference}</p>
            <p style="margin: 0 0 6px;"><strong>Metodo:</strong> ${input.provider.toUpperCase()}</p>
            <p style="margin: 0;"><strong>Fecha:</strong> ${paidDate}</p>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">Subtotal del servicio</td>
              <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; text-align: right;"><strong>$${subtotal.toFixed(2)}</strong></td>
            </tr>
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">Comision Fixlife</td>
              <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb; text-align: right;"><strong>$${input.platformFee.toFixed(2)}</strong></td>
            </tr>
            <tr>
              <td style="padding: 10px 0;">Total pagado</td>
              <td style="padding: 10px 0; text-align: right; font-size: 18px;"><strong>$${input.amount.toFixed(2)}</strong></td>
            </tr>
          </table>
          <p style="font-size: 13px; color: #4b5563; margin-top: 14px;">Pago neto para el trabajador: $${input.workerPayout.toFixed(2)}.</p>
          <p style="margin-top: 18px;">Gracias por usar Fixlife.</p>
        </div>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Payment invoice email sent: %s', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending payment invoice email:', error);
    return false;
  }
};

type WorkerPaymentNoticeInput = {
  to: string;
  workerName: string;
  requestId: number;
  serviceName: string;
  amount: number;
  checkoutReference: string;
};

export const sendWorkerPaymentSecuredEmail = async (input: WorkerPaymentNoticeInput) => {
  const mailOptions = {
    from: `"Fixlife Payments" <${process.env.EMAIL_USER || 'no-reply@fixlife.local'}>`,
    to: input.to,
    subject: `Pago confirmado para tu servicio #${input.requestId}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;">
        <div style="background-color: #059669; padding: 20px; text-align: center;">
          <h2 style="color: #ffffff; margin: 0;">Pago completado con exito</h2>
        </div>
        <div style="padding: 22px; color: #111827;">
          <p>Hola ${input.workerName},</p>
          <p>El pago de tu reciente servicio se ha efectuado y completado con exito.</p>
          <div style="margin: 16px 0; padding: 14px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;">
            <p style="margin: 0 0 6px;"><strong>Solicitud:</strong> #${input.requestId}</p>
            <p style="margin: 0 0 6px;"><strong>Servicio:</strong> ${input.serviceName}</p>
            <p style="margin: 0 0 6px;"><strong>Monto asegurado:</strong> $${input.amount.toFixed(2)}</p>
            <p style="margin: 0;"><strong>Referencia:</strong> ${input.checkoutReference}</p>
          </div>
          <p style="font-size: 13px; color: #4b5563;">Ya puedes continuar con la atencion del servicio desde tu panel profesional.</p>
          <p>Equipo Fixlife</p>
        </div>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Worker payment secured email sent: %s', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending worker payment secured email:', error);
    return false;
  }
};
