-- Multi-tenant identity, barber profiles and availability.
-- Additive migration: preserves existing users, shops, services and bookings.

CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'MANAGER', 'RECEPTIONIST', 'BARBER');
CREATE TYPE "MemberStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');
CREATE TYPE "BookingStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

ALTER TABLE "User"
  ADD COLUMN "emailVerified" TIMESTAMP(3),
  ADD COLUMN "image" TEXT,
  ADD COLUMN "passwordHash" TEXT;

ALTER TABLE "BarbershopService"
  ADD COLUMN "durationMinutes" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE "Booking"
  ADD COLUMN "professionalId" TEXT,
  ADD COLUMN "status" "BookingStatus" NOT NULL DEFAULT 'REQUESTED',
  ADD COLUMN "priceAtBooking" DECIMAL(10,2),
  ADD COLUMN "durationMinutes" INTEGER,
  ADD COLUMN "customerNotes" TEXT,
  ADD COLUMN "internalNotes" TEXT;

CREATE TABLE "Account" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "refresh_token" TEXT,
  "access_token" TEXT,
  "expires_at" INTEGER,
  "token_type" TEXT,
  "scope" TEXT,
  "id_token" TEXT,
  "session_state" TEXT,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "sessionToken" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VerificationToken" (
  "identifier" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "BarbershopMember" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "barbershopId" TEXT NOT NULL,
  "role" "MemberRole" NOT NULL,
  "status" "MemberStatus" NOT NULL DEFAULT 'INVITED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BarbershopMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Professional" (
  "id" TEXT NOT NULL,
  "barbershopId" TEXT NOT NULL,
  "userId" TEXT,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "imageUrl" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Professional_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProfessionalService" (
  "professionalId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  CONSTRAINT "ProfessionalService_pkey" PRIMARY KEY ("professionalId", "serviceId")
);

CREATE TABLE "ProfessionalWorkingHour" (
  "id" TEXT NOT NULL,
  "professionalId" TEXT NOT NULL,
  "weekDay" INTEGER NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProfessionalWorkingHour_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProfessionalTimeOff" (
  "id" TEXT NOT NULL,
  "professionalId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfessionalTimeOff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");
CREATE UNIQUE INDEX "BarbershopMember_userId_barbershopId_key" ON "BarbershopMember"("userId", "barbershopId");
CREATE INDEX "BarbershopMember_barbershopId_status_role_idx" ON "BarbershopMember"("barbershopId", "status", "role");
CREATE INDEX "BarbershopMember_userId_status_idx" ON "BarbershopMember"("userId", "status");
CREATE INDEX "Professional_barbershopId_active_idx" ON "Professional"("barbershopId", "active");
CREATE INDEX "Professional_userId_idx" ON "Professional"("userId");
CREATE INDEX "ProfessionalService_serviceId_idx" ON "ProfessionalService"("serviceId");
CREATE INDEX "ProfessionalWorkingHour_professionalId_weekDay_active_idx" ON "ProfessionalWorkingHour"("professionalId", "weekDay", "active");
CREATE INDEX "ProfessionalTimeOff_professionalId_startsAt_endsAt_idx" ON "ProfessionalTimeOff"("professionalId", "startsAt", "endsAt");
CREATE INDEX "Booking_date_status_idx" ON "Booking"("date", "status");
CREATE INDEX "Booking_professionalId_date_status_idx" ON "Booking"("professionalId", "date", "status");
CREATE INDEX "Booking_userId_date_idx" ON "Booking"("userId", "date");
CREATE INDEX "Booking_serviceId_date_idx" ON "Booking"("serviceId", "date");

ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BarbershopMember" ADD CONSTRAINT "BarbershopMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BarbershopMember" ADD CONSTRAINT "BarbershopMember_barbershopId_fkey"
  FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Professional" ADD CONSTRAINT "Professional_barbershopId_fkey"
  FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfessionalService" ADD CONSTRAINT "ProfessionalService_professionalId_fkey"
  FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfessionalService" ADD CONSTRAINT "ProfessionalService_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "BarbershopService"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfessionalWorkingHour" ADD CONSTRAINT "ProfessionalWorkingHour_professionalId_fkey"
  FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfessionalTimeOff" ADD CONSTRAINT "ProfessionalTimeOff_professionalId_fkey"
  FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_professionalId_fkey"
  FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE SET NULL ON UPDATE CASCADE;
