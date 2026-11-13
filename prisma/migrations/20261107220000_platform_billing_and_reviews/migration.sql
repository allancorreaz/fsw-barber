-- Localização da barbearia para a busca por proximidade
ALTER TABLE "Barbershop" ADD COLUMN "latitude" DOUBLE PRECISION, ADD COLUMN "longitude" DOUBLE PRECISION;

-- Booking passa a carregar a chave do tenant
ALTER TABLE "Booking" ADD COLUMN "barbershopId" TEXT;
UPDATE "Booking" b SET "barbershopId" = s."barbershopId" FROM "BarbershopService" s WHERE s."id" = b."serviceId";
ALTER TABLE "Booking" ALTER COLUMN "barbershopId" SET NOT NULL;
ALTER TABLE "Booking" ADD COLUMN "consumerSubscriptionId" TEXT, ADD COLUMN "coveredByPlan" BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX "Booking_barbershopId_date_status_idx" ON "Booking"("barbershopId","date","status");
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_consumerSubscriptionId_fkey" FOREIGN KEY ("consumerSubscriptionId") REFERENCES "ConsumerSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Planos e assinaturas do consumidor
ALTER TABLE "ConsumerPlan" ADD COLUMN "bookingsPerCycle" INTEGER;
ALTER TABLE "ConsumerSubscription" ADD COLUMN "amount" DECIMAL(10,2), ADD COLUMN "cancelledAt" TIMESTAMP(3), ADD COLUMN "gateway" TEXT, ADD COLUMN "gatewaySubscriptionId" TEXT;
CREATE UNIQUE INDEX "ConsumerSubscription_gatewaySubscriptionId_key" ON "ConsumerSubscription"("gatewaySubscriptionId");

-- Pagamentos
ALTER TABLE "BillingPayment" ADD COLUMN "method" TEXT, ADD COLUMN "description" TEXT;

-- Conta Mercado Pago conectada por barbearia
CREATE TABLE "MercadoPagoAccount" ("id" TEXT NOT NULL,"barbershopId" TEXT NOT NULL,"mpUserId" TEXT NOT NULL,"accessTokenEnc" TEXT NOT NULL,"refreshTokenEnc" TEXT,"publicKey" TEXT,"liveMode" BOOLEAN NOT NULL DEFAULT FALSE,"expiresAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "MercadoPagoAccount_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "MercadoPagoAccount_barbershopId_key" ON "MercadoPagoAccount"("barbershopId");
CREATE INDEX "MercadoPagoAccount_mpUserId_idx" ON "MercadoPagoAccount"("mpUserId");
ALTER TABLE "MercadoPagoAccount" ADD CONSTRAINT "MercadoPagoAccount_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Avaliações internas (somente de atendimentos concluídos)
CREATE TABLE "Review" ("id" TEXT NOT NULL,"bookingId" TEXT NOT NULL,"userId" TEXT NOT NULL,"barbershopId" TEXT NOT NULL,"rating" INTEGER NOT NULL,"comment" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "Review_pkey" PRIMARY KEY ("id"),CONSTRAINT "Review_rating_check" CHECK ("rating" BETWEEN 1 AND 5));
CREATE UNIQUE INDEX "Review_bookingId_key" ON "Review"("bookingId");
CREATE INDEX "Review_barbershopId_createdAt_idx" ON "Review"("barbershopId","createdAt");
ALTER TABLE "Review" ADD CONSTRAINT "Review_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
