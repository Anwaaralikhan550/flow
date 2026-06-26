-- DropIndex
DROP INDEX "MasterAccount_email_key";

-- Partial unique index: only enforces email-uniqueness among accounts that are
-- not soft-deleted. Lets a brand-new account reuse the email of a previously
-- deleted one without a constraint conflict, while the deleted row (and its
-- usage/billing history) stays in the table untouched.
CREATE UNIQUE INDEX "MasterAccount_email_active_key" ON "MasterAccount"("email") WHERE "deletedAt" IS NULL;
