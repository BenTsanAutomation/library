import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const db = new Database('/home/user/.openclaw/workspace/apps/library/data/db.db');
const email = 'admin@library.example.com';
const name = 'Admin';
const plain = 'CHANGE_ME_PASSWORD';
const salt = crypto.randomBytes(32).toString('hex');
const password = await bcrypt.hash(plain + salt, 10);
const now = Date.now();

const exists = db.prepare('select id from user where email = ?').get(email);
if (!exists) {
  const count = db.prepare('select count(*) as c from user').get().c;
  db.prepare(`insert into user (id, name, email, password, salt, role, emailVerified, bookmarkQuota, storageQuota)
              values (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(crypto.randomUUID(), name, email, password, salt, count === 0 ? 'admin' : 'user', now, 100000, 52428800);
  console.log('created');
} else {
  console.log('exists');
}
