import nodemailer from "nodemailer";

// =====================================================
// CREATE EMAIL TRANSPORTER
// =====================================================

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,

  secure:
    process.env.SMTP_SECURE === "true",

  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

// =====================================================
// SEND EMAIL
// =====================================================

const sendEmail = async ({
  to,
  subject,
  text,
  html,
}) => {
  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || "POS SaaS"}" <${process.env.EMAIL_FROM}>`,

    to,

    subject,

    text,

    html,
  };

  await transporter.sendMail(mailOptions);
};

export default sendEmail;