-- 0037: members book at € 10 (was € 8). A session is € 15; with the € 10/maand abonnement you get
-- 1 gratis sessie per maand én boek je daarna aan € 10 i.p.v. € 15.
update services set member_price_cents = 1000 where key = 'fit60';
