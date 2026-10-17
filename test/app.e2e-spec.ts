import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Mailer } from '../src/auth/mailer.service';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

class CapturingMailer extends Mailer {
  links = new Map<string, string>();
  async sendMagicLink(email: string, link: string) {
    this.links.set(email, link.split('#token=')[1]);
  }
}

describe('Solace API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const mailer = new CapturingMailer();
  const http = () => request(app.getHttpServer());

  async function signIn(email: string) {
    await http().post('/v1/auth/magic-link').send({ email }).expect(202);
    const res = await http().post('/v1/auth/verify').send({ token: mailer.links.get(email.toLowerCase()) }).expect(200);
    return res.body as { accessToken: string; refreshToken: string; isNewUser: boolean };
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(Mailer).useValue(mailer).compile();
    app = configureApp(mod.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(() => app.close());

  describe('auth', () => {
    it('signs a new user in with a magic link and never stores the email in plaintext', async () => {
      const tokens = await signIn('Sam@Example.com');
      expect(tokens.isNewUser).toBe(true);
      const users = await prisma.user.findMany();
      const raw = JSON.stringify(users, (_, v) => (v?.type === 'Buffer' ? Buffer.from(v.data).toString('latin1') : v));
      expect(raw.toLowerCase()).not.toContain('sam@example.com');
    });

    it('accepts any email the same way (no account enumeration)', async () => {
      const a = await http().post('/v1/auth/magic-link').send({ email: 'sam@example.com' });
      const b = await http().post('/v1/auth/magic-link').send({ email: 'nobody@example.com' });
      expect([a.status, a.body]).toEqual([b.status, b.body]);
    });

    it('rejects a magic link used twice', async () => {
      await http().post('/v1/auth/magic-link').send({ email: 'once@example.com' }).expect(202);
      const token = mailer.links.get('once@example.com');
      await http().post('/v1/auth/verify').send({ token }).expect(200);
      await http().post('/v1/auth/verify').send({ token }).expect(401);
    });

    it('rotates refresh tokens and revokes the family on reuse', async () => {
      const { refreshToken } = await signIn('rotate@example.com');
      const next = await http().post('/v1/auth/refresh').send({ refreshToken }).expect(200);
      await http().post('/v1/auth/refresh').send({ refreshToken }).expect(401);
      await http().post('/v1/auth/refresh').send({ refreshToken: next.body.refreshToken }).expect(401);
    });

    it('requires a token for private routes', async () => {
      await http().get('/v1/me').expect(401);
      await http().get('/v1/me').set('Authorization', 'Bearer nope').expect(401);
    });
  });

  describe('public safety routes', () => {
    it('serves crisis resources without login', async () => {
      const res = await http().get('/v1/crisis-resources?country=GB').expect(200);
      expect(res.body.line.phone).toBe('116123');
    });

    it('records an anonymous self-report', async () => {
      await http().post('/v1/safety/events').send({ tier: 'high', source: 'self_report', locale: 'gb' }).expect(202);
      const ev = await prisma.safetyEvent.findFirst({ where: { source: 'self_report' } });
      expect(ev).toMatchObject({ tier: 'high', locale: 'GB' });
      expect(ev!.hourBucket.getUTCMinutes()).toBe(0);
    });
  });

  describe('signed-in user', () => {
    let auth: string;
    beforeAll(async () => {
      auth = `Bearer ${(await signIn('user@example.com')).accessToken}`;
    });

    it('sets path, country and age; refuses the grief path until it is enabled', async () => {
      const res = await http().patch('/v1/me').set('Authorization', auth).send({ path: 'heartbreak', country: 'GB', ageConfirmed: true }).expect(200);
      expect(res.body).toMatchObject({ path: 'heartbreak', country: 'GB', ageConfirmed: true });
      await http().patch('/v1/me').set('Authorization', auth).send({ path: 'grief' }).expect(400);
    });

    it('records and withdraws consent', async () => {
      await http().put('/v1/me/consents').set('Authorization', auth).send({ purpose: 'health_data_processing', version: '1.0', granted: true }).expect(200);
      const res = await http().put('/v1/me/consents').set('Authorization', auth).send({ purpose: 'health_data_processing', version: '1.0', granted: false }).expect(200);
      expect(res.body.consents).toEqual([]);
    });

    it('stores check-in notes encrypted and flags risk without storing why', async () => {
      const ok = await http().post('/v1/check-ins').set('Authorization', auth).send({ mood: 'numb', note: 'quiet day' }).expect(201);
      expect(ok.body.riskTier).toBe('none');
      const risky = await http().post('/v1/check-ins').set('Authorization', auth).send({ mood: 'bad', note: 'I want to die' }).expect(201);
      expect(risky.body.riskTier).toBe('high');

      const row = await prisma.checkIn.findUnique({ where: { id: ok.body.id } });
      expect(Buffer.from(row!.noteCipher!).toString('latin1')).not.toContain('quiet day');
      const events = await prisma.safetyEvent.findMany({ where: { source: 'checkin' } });
      expect(events).toHaveLength(1);
      expect(Object.keys(events[0]).sort()).toEqual(['hourBucket', 'id', 'locale', 'source', 'tier']);

      const list = await http().get('/v1/check-ins').set('Authorization', auth).expect(200);
      expect(list.body.map((c: { note: string }) => c.note)).toEqual(['I want to die', 'quiet day']);
    });

    it('rejects invalid input and unknown fields', async () => {
      await http().post('/v1/check-ins').set('Authorization', auth).send({ mood: 'great' }).expect(400);
      await http().post('/v1/check-ins').set('Authorization', auth).send({ mood: 'okay', streak: 3 }).expect(400);
    });

    it('is idempotent on client-generated ids (offline sync)', async () => {
      const id = '0192f6a0-0000-7000-8000-000000000001';
      await http().post('/v1/check-ins').set('Authorization', auth).send({ id, mood: 'okay' }).expect(201);
      await http().post('/v1/check-ins').set('Authorization', auth).send({ id, mood: 'okay' }).expect(201);
      expect(await prisma.checkIn.count({ where: { id } })).toBe(1);
    });

    it('detects journal edit conflicts across devices', async () => {
      const created = await http().post('/v1/journal').set('Authorization', auth).send({ body: 'first draft' }).expect(201);
      const id = created.body.id;
      await http().patch(`/v1/journal/${id}`).set('Authorization', auth).send({ body: 'phone edit', version: 1 }).expect(200);
      const conflict = await http().patch(`/v1/journal/${id}`).set('Authorization', auth).send({ body: 'laptop edit', version: 1 }).expect(409);
      expect(conflict.body.current.body).toBe('phone edit');
    });

    it('keeps another user out of my journal', async () => {
      const mine = await http().post('/v1/journal').set('Authorization', auth).send({ body: 'private' }).expect(201);
      const other = `Bearer ${(await signIn('other@example.com')).accessToken}`;
      await http().get(`/v1/journal/${mine.body.id}`).set('Authorization', other).expect(404);
      await http().delete(`/v1/journal/${mine.body.id}`).set('Authorization', other).expect(404);
    });

    it('seals and releases unsent letters', async () => {
      const l = await http().post('/v1/letters').set('Authorization', auth).send({ recipient: 'Alex', body: 'I miss you' }).expect(201);
      const sealed = await http().patch(`/v1/letters/${l.body.id}`).set('Authorization', auth).send({ state: 'sealed', version: 1 }).expect(200);
      expect(sealed.body.state).toBe('sealed');
      await http().patch(`/v1/letters/${l.body.id}`).set('Authorization', auth).send({ body: 'edit', version: 2 }).expect(409);
      await http().delete(`/v1/letters/${l.body.id}`).set('Authorization', auth).expect(204);
      expect(await prisma.unsentLetter.count({ where: { id: l.body.id } })).toBe(0);
    });

    it('counts no-contact days as totals, never streaks', async () => {
      await http().put('/v1/contact-log/2026-10-01').set('Authorization', auth).send({ contacted: false }).expect(200);
      await http().put('/v1/contact-log/2026-10-02').set('Authorization', auth).send({ contacted: true, note: 'texted at 2am' }).expect(200);
      await http().put('/v1/contact-log/2026-10-03').set('Authorization', auth).send({ contacted: false }).expect(200);
      const res = await http().get('/v1/contact-log').set('Authorization', auth).expect(200);
      expect(res.body).toMatchObject({ noContactDays: 2, contactDays: 1, loggedDays: 3 });
      await http().put('/v1/contact-log/2026-02-30').set('Authorization', auth).send({ contacted: false }).expect(400);
      await http().put('/v1/contact-log/2999-01-01').set('Authorization', auth).send({ contacted: false }).expect(400);
    });

    it('records helpfulness ratings', async () => {
      await http().post('/v1/feedback').set('Authorization', auth).send({ toolSlot: 'guided.breathe', rating: 4 }).expect(201);
      await http().post('/v1/feedback').set('Authorization', auth).send({ toolSlot: 'guided.breathe', rating: 9 }).expect(400);
    });

    it('exports everything decrypted, then deletes it all', async () => {
      const exp = await http().get('/v1/me/export').set('Authorization', auth).expect(200);
      expect(exp.body.profile.email).toBe('user@example.com');
      expect(exp.body.journal.length).toBeGreaterThan(0);
      expect(exp.body.contactLog).toHaveLength(3);

      const me = await http().get('/v1/me').set('Authorization', auth).expect(200);
      await http().delete('/v1/me').set('Authorization', auth).expect(204);
      const userId = me.body.id;
      const counts = await Promise.all([
        prisma.user.count({ where: { id: userId } }),
        prisma.checkIn.count({ where: { userId } }),
        prisma.journalEntry.count({ where: { userId } }),
        prisma.unsentLetter.count({ where: { userId } }),
        prisma.contactLog.count({ where: { userId } }),
        prisma.feedback.count({ where: { userId } }),
        prisma.refreshToken.count({ where: { userId } }),
      ]);
      expect(counts).toEqual([0, 0, 0, 0, 0, 0, 0]);
    });
  });
});
