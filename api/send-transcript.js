// Vercel/Netlify serverless function for sending email transcripts
import { Resend } from 'resend';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, name, transcript, projects, hours } = req.body;

  if (!email || !transcript) {
    return res.status(400).json({ error: 'Email and transcript required' });
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Format transcript for email
    const transcriptHtml = transcript
      .map(msg => `
        <div style="margin-bottom: 16px;">
          <strong style="color: ${msg.role === 'user' ? '#10b981' : '#3b82f6'};">
            ${msg.role === 'user' ? name || 'Candidate' : 'AI'}:
          </strong>
          <p style="margin: 4px 0 0 0;">${msg.content}</p>
        </div>
      `)
      .join('');

    const projectsList = projects && projects.length > 0
      ? projects.map(p => `<li>${p}</li>`).join('')
      : '<li>None selected</li>';

    // Email to candidate
    await resend.emails.send({
      from: 'Educator + 3CS Builder <noreply@jimr.fyi>',
      to: email,
      subject: 'Your Educator + 3CS Builder Application',
      html: `
        <h2>Thanks for your interest!</h2>
        <p>Here's a copy of our conversation:</p>
        <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
          ${transcriptHtml}
        </div>
        <h3>Your Selections</h3>
        <p><strong>Projects interested in:</strong></p>
        <ul>${projectsList}</ul>
        <p><strong>Hours per month:</strong> ${hours || 'Not specified'}</p>
        <p>We'll review your application and get back to you soon!</p>
        <p>— Jim & the 3CS team</p>
      `,
    });

    // Email to admin
    await resend.emails.send({
      from: 'Educator Builder <noreply@jimr.fyi>',
      to: process.env.ADMIN_EMAIL,
      subject: `New Application: ${name || email}`,
      html: `
        <h2>New application submitted</h2>
        <p><strong>Name:</strong> ${name || 'Not provided'}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Hours:</strong> ${hours || 'Not specified'} hrs/month</p>
        <h3>Projects interested in:</h3>
        <ul>${projectsList}</ul>
        <h3>Full Transcript</h3>
        <div style="background: #f5f5f5; padding: 16px; border-radius: 8px;">
          ${transcriptHtml}
        </div>
      `,
    });

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('Email send error:', error);
    res.status(500).json({ error: 'Failed to send emails' });
  }
}
