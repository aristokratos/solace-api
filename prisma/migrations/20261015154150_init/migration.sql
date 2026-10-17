-- CreateEnum
CREATE TYPE "public"."SupportPath" AS ENUM ('heartbreak', 'grief');

-- CreateEnum
CREATE TYPE "public"."Mood" AS ENUM ('bad', 'numb', 'okay');

-- CreateEnum
CREATE TYPE "public"."LetterState" AS ENUM ('draft', 'kept', 'sealed');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" UUID NOT NULL,
    "emailHash" TEXT NOT NULL,
    "emailCipher" BYTEA NOT NULL,
    "wrappedKey" BYTEA NOT NULL,
    "path" "public"."SupportPath",
    "country" CHAR(2),
    "ageConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MagicLink" (
    "id" UUID NOT NULL,
    "emailHash" TEXT NOT NULL,
    "emailCipher" BYTEA NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagicLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Consent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CheckIn" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "mood" "public"."Mood" NOT NULL,
    "noteCipher" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."JournalEntry" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "promptSlot" TEXT,
    "bodyCipher" BYTEA NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UnsentLetter" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "recipientCipher" BYTEA NOT NULL,
    "bodyCipher" BYTEA NOT NULL,
    "state" "public"."LetterState" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnsentLetter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContactLog" (
    "userId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "contacted" BOOLEAN NOT NULL,
    "noteCipher" BYTEA,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactLog_pkey" PRIMARY KEY ("userId","day")
);

-- CreateTable
CREATE TABLE "public"."Feedback" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "toolSlot" TEXT NOT NULL,
    "rating" SMALLINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SafetyEvent" (
    "id" UUID NOT NULL,
    "tier" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "locale" TEXT,
    "hourBucket" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafetyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_emailHash_key" ON "public"."User"("emailHash");

-- CreateIndex
CREATE UNIQUE INDEX "MagicLink_tokenHash_key" ON "public"."MagicLink"("tokenHash");

-- CreateIndex
CREATE INDEX "MagicLink_emailHash_createdAt_idx" ON "public"."MagicLink"("emailHash", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "public"."RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "public"."RefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "Consent_userId_purpose_idx" ON "public"."Consent"("userId", "purpose");

-- CreateIndex
CREATE INDEX "CheckIn_userId_createdAt_idx" ON "public"."CheckIn"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "JournalEntry_userId_updatedAt_idx" ON "public"."JournalEntry"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "UnsentLetter_userId_updatedAt_idx" ON "public"."UnsentLetter"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "public"."RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Consent" ADD CONSTRAINT "Consent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CheckIn" ADD CONSTRAINT "CheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."JournalEntry" ADD CONSTRAINT "JournalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UnsentLetter" ADD CONSTRAINT "UnsentLetter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContactLog" ADD CONSTRAINT "ContactLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
