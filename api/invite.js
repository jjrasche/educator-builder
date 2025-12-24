// Referral Network: Invite System
// Generate invites, validate codes, track conversions
// NOTE: Currently in-memory only. For persistence, migrate to Postgres.

import crypto from 'crypto';

// In-memory store (persists across requests in same serverless instance)
// For production persistence, this should be migrated to Postgres
const inviteStore = globalThis.__inviteStore || (globalThis.__inviteStore = new Map());

export default async function handler(req, res) {
  const { action } = req.query;

  try {
    switch (action) {
      case 'generate':
        return handleGenerate(req, res);
      case 'validate':
        return handleValidate(req, res);
      case 'convert':
        return handleConvert(req, res);
      case 'list':
        return handleList(req, res);
      case 'stats':
        return handleStats(req, res);
      default:
        return res.status(400).json({ error: 'Invalid action. Use: generate, validate, convert, list, stats' });
    }
  } catch (error) {
    console.error('Invite error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// Generate a new invite code
async function handleGenerate(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { inviterEmail, inviteeEmail, inviteeName } = req.body;

  if (!inviterEmail) {
    return res.status(400).json({ error: 'inviterEmail required' });
  }

  // Generate unique invite code
  const code = crypto.randomBytes(8).toString('hex');
  const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days

  const invite = {
    code,
    inviterEmail,
    inviteeEmail: inviteeEmail || null,
    inviteeName: inviteeName || null,
    status: 'pending', // pending, converted, expired
    createdAt: Date.now(),
    expiresAt,
    convertedAt: null,
    convertedEmail: null
  };

  // Store invite
  await kvSet(req, `invite:${code}`, invite);

  // Track inviter's sent invites
  const inviterKey = `inviter:${inviterEmail}`;
  const inviterData = await kvGet(req, inviterKey) || { invites: [], conversions: 0 };
  inviterData.invites.push(code);
  await kvSet(req, inviterKey, inviterData);

  // Generate invite URL
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';
  const inviteUrl = `${baseUrl}?invite=${code}`;

  return res.status(200).json({
    success: true,
    code,
    inviteUrl,
    expiresAt: new Date(expiresAt).toISOString(),
    message: inviteeEmail
      ? `Invite created for ${inviteeEmail}`
      : 'Invite created (open invite)'
  });
}

// Validate an invite code
async function handleValidate(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'code required' });
  }

  const invite = await kvGet(req, `invite:${code}`);

  if (!invite) {
    return res.status(404).json({
      valid: false,
      error: 'Invite not found'
    });
  }

  if (invite.status === 'converted') {
    return res.status(400).json({
      valid: false,
      error: 'Invite already used'
    });
  }

  if (Date.now() > invite.expiresAt) {
    invite.status = 'expired';
    await kvSet(req, `invite:${code}`, invite);
    return res.status(400).json({
      valid: false,
      error: 'Invite expired'
    });
  }

  return res.status(200).json({
    valid: true,
    invitedBy: invite.inviterEmail,
    inviteeName: invite.inviteeName,
    expiresAt: new Date(invite.expiresAt).toISOString()
  });
}

// Convert an invite (user signs up)
async function handleConvert(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, email } = req.body;

  if (!code || !email) {
    return res.status(400).json({ error: 'code and email required' });
  }

  const invite = await kvGet(req, `invite:${code}`);

  if (!invite) {
    return res.status(404).json({ error: 'Invite not found' });
  }

  if (invite.status === 'converted') {
    return res.status(400).json({ error: 'Invite already used' });
  }

  if (Date.now() > invite.expiresAt) {
    return res.status(400).json({ error: 'Invite expired' });
  }

  // Mark invite as converted
  invite.status = 'converted';
  invite.convertedAt = Date.now();
  invite.convertedEmail = email;
  await kvSet(req, `invite:${code}`, invite);

  // Update inviter's conversion count
  const inviterKey = `inviter:${invite.inviterEmail}`;
  const inviterData = await kvGet(req, inviterKey) || { invites: [], conversions: 0 };
  inviterData.conversions += 1;
  await kvSet(req, inviterKey, inviterData);

  // Create user record
  const userKey = `user:${email}`;
  const existingUser = await kvGet(req, userKey);

  if (!existingUser) {
    const user = {
      email,
      invitedBy: invite.inviterEmail,
      joinedAt: Date.now(),
      inviteCode: code,
      invitesSent: [],
      conversions: 0,
      conversations: [],
      modalityPreference: null
    };
    await kvSet(req, userKey, user);

    // Track in global user list
    const allUsers = await kvGet(req, 'users:all') || [];
    allUsers.push(email);
    await kvSet(req, 'users:all', allUsers);
  }

  return res.status(200).json({
    success: true,
    message: `Welcome! You were invited by ${invite.inviterEmail}`,
    invitedBy: invite.inviterEmail
  });
}

// List invites for an inviter
async function handleList(req, res) {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'email required' });
  }

  const inviterData = await kvGet(req, `inviter:${email}`);

  if (!inviterData) {
    return res.status(200).json({ invites: [], conversions: 0 });
  }

  // Get full invite details
  const invites = await Promise.all(
    inviterData.invites.map(async code => {
      const invite = await kvGet(req, `invite:${code}`);
      return invite ? {
        code,
        status: invite.status,
        inviteeEmail: invite.inviteeEmail,
        inviteeName: invite.inviteeName,
        createdAt: new Date(invite.createdAt).toISOString(),
        convertedAt: invite.convertedAt ? new Date(invite.convertedAt).toISOString() : null,
        convertedEmail: invite.convertedEmail
      } : null;
    })
  );

  return res.status(200).json({
    invites: invites.filter(i => i),
    conversions: inviterData.conversions,
    conversionRate: inviterData.invites.length > 0
      ? (inviterData.conversions / inviterData.invites.length * 100).toFixed(1) + '%'
      : '0%'
  });
}

// Get network stats (admin)
async function handleStats(req, res) {
  const allUsers = await kvGet(req, 'users:all') || [];

  // Get user details
  const users = await Promise.all(
    allUsers.map(async email => {
      const user = await kvGet(req, `user:${email}`);
      return user;
    })
  );

  // Calculate network stats
  const totalUsers = users.filter(u => u).length;
  const totalInvitesSent = users.reduce((sum, u) => sum + (u?.invitesSent?.length || 0), 0);
  const totalConversions = users.reduce((sum, u) => sum + (u?.conversions || 0), 0);

  // Referral tree depth
  const depths = {};
  users.forEach(user => {
    if (!user) return;
    let depth = 0;
    let current = user;
    while (current?.invitedBy) {
      depth++;
      const inviter = users.find(u => u?.email === current.invitedBy);
      if (!inviter || depth > 10) break;
      current = inviter;
    }
    depths[user.email] = depth;
  });

  const maxDepth = Math.max(...Object.values(depths), 0);
  const viralCoefficient = totalUsers > 0 ? (totalConversions / totalUsers).toFixed(2) : 0;

  return res.status(200).json({
    totalUsers,
    totalInvitesSent,
    totalConversions,
    conversionRate: totalInvitesSent > 0
      ? (totalConversions / totalInvitesSent * 100).toFixed(1) + '%'
      : '0%',
    maxNetworkDepth: maxDepth,
    viralCoefficient,
    users: users.filter(u => u).map(u => ({
      email: u.email,
      invitedBy: u.invitedBy,
      joinedAt: new Date(u.joinedAt).toISOString(),
      invitesSent: u.invitesSent?.length || 0,
      conversions: u.conversions || 0,
      networkDepth: depths[u.email] || 0
    }))
  });
}

// In-memory storage helpers
// TODO: Migrate to Postgres for persistence across serverless instances
async function kvGet(req, key) {
  return inviteStore.get(key) || null;
}

async function kvSet(req, key, value) {
  inviteStore.set(key, value);
}
