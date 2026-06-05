-- 0018: carry a referral code from a buddy-invite link through signup, then auto-redeem on first
-- authenticated load (the invitee doesn't have to paste it in /community).
alter table profiles add column if not exists pending_referral text;
