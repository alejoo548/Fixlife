import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

export const sendResetEmail = async (email: string, token: string) => {


  await transporter.sendMail({
    from: '"FixLife Support" <fixlifeworks@gmail.com>',
    to: email,
    subject: "Reset your FixLife password",
    html: `
      <h2>Password Reset</h2>
      <p>You requested to reset your password.</p>
      <p>Your verification code is:</p>
      <h1>${token}</h1>

      <p>This code expires in 15 minutes.</p>
    `
  });

};