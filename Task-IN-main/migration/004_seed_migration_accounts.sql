-- Task’in / Supabase
-- Migration 004 : registre initial des comptes historiques Firebase
-- Cette migration ne crée aucun compte Auth et ne supprime rien.

insert into public.migration_accounts
  (legacy_provider, legacy_account_id, display_name, email, role, status, has_time_entries, time_entries_count, source_payload)
values
  ('firebase','2qnsCqh2MIXGgYl2jdaQTv9Ovmr1','Crystella','agent4@onspot.travel','agent','pending_review',false,0,'{"source":"firebase-export"}'),
  ('firebase','4pH21TTN15RBK8C9p0dDbnmGKe03','Agent 20','agent20@onspot.travel','agent','pending_review',false,0,'{"source":"firebase-export"}'),
  ('firebase','67tFyTxQv2g056TGyVQGfYer88J2','Agent 11','agent11@onspot.travel','agent','pending_review',false,0,'{"source":"firebase-export"}'),
  ('firebase','6hcqKg5ZXjVbxVcokn6tX0pgQ6j2','Formateur','agent13@onspot.travel','formateur','pending_review',false,0,'{"source":"firebase-export"}'),
  ('firebase','7DwUOkilrUNwroEJjwpxXRsRhfG2','Admin','agent3@onspot.travel','admin','pending_review',true,3,'{"source":"firebase-export"}'),
  ('firebase','AlF4x9z38oXbRuWkK5ThhkTddW53','Agent 17','agent17@onspot.travel','agent','pending_review',false,0,'{"source":"firebase-export"}'),
  ('firebase','IY6XpHkh4oQyVkx6QwuTTGC6flr2','Agent 8','agent8@onspot.travel','agent','pending_review',false,0,'{"source":"firebase-export"}'),
  ('firebase','OA6eBnhDlcMf9UmOPvlVlzFmxMK2','Agent 18','agent18@onspot.travel','agent','pending_review',false,0,'{"source":"firebase-export"}'),
  ('firebase','P9NBsFJrD6aqEqfldZzO4dDroTH3','Superviseur 1','agent2@onspot.travel','supervisor','pending_review',true,35,'{"source":"firebase-export"}'),
  ('firebase','PVHwG4QWyIMJ5BQVsImkqnFVcHx2','Agent 10','agent10@onspot.travel','agent','pending_review',false,0,'{"source":"firebase-export"}'),
  ('firebase','PnL920A10HWHtgc2GpSSEyNLcJL2','Agent 7','agent7@onspot.travel','agent','pending_review',false,0,'{"source":"firebase-export"}'),
  ('firebase','RB3w26gsUuUhLBkewAebArFU6Uu2','Agent 5','agent5@onspot.travel','agent','pending_review',false,0,'{"source":"firebase-export"}'),
  ('firebase','RoCc7eu74MdT0u3uKA3ROezpqn33','Agent 15','agent15@onspot.travel','agent','pending_review',false,0,'{"source":"firebase-export"}'),
  ('firebase','SZFGEhhb6lPirL9OzfIrxOXsiBI3','Agent 16','agent16@onspot.travel','agent','pending_review',false,0,'{"source":"firebase-export"}'),
  ('firebase','VBNqW3dO0vS2KglME4ieyQAlA3B3','Agent 19','agent19@onspot.travel','agent','pending_review',false,0,'{"source":"firebase-export"}'),
  ('firebase','XrsmB4eBCIUGeyhRYY7FEUoYXAR2','Agent 12','agent12@onspot.travel','agent','pending_review',false,0,'{"source":"firebase-export"}'),
  ('firebase','crystella','Tendry','','agent','pending_review',false,0,'{"source":"firebase-export"}'),
  ('firebase','ez1eZgfnecYstphRAqBQh9fDbiW2','Admin','john-ext@onspot.travel','admin','pending_review',false,0,'{"source":"firebase-export"}'),
  ('firebase','gVLT4vcOYiYkWZ03HELIRkVMMNj1','Agent 9','agent9@onspot.travel','agent','pending_review',false,0,'{"source":"firebase-export"}'),
  ('firebase','gaelle','Gaelle','','agent','pending_review',false,0,'{"source":"firebase-export"}'),
  ('firebase','hq9vIEH1hpeCAXBTU1vu868zSSy1','Patrick Kama','agent1@onspot.travel','agent','pending_review',true,79,'{"source":"firebase-export"}'),
  ('firebase','igkiNb8vtVQEz6IKTcGNNRjHMtB2','Agent 13','agent6@onspot.travel','agent','pending_review',true,106,'{"source":"firebase-export"}'),
  ('firebase','john','John','','admin','pending_review',false,0,'{"source":"firebase-export"}'),
  ('firebase','johnr','John R.','','agent','pending_review',true,31,'{"source":"firebase-export"}'),
  ('firebase','patrick','Patrick','','agent','pending_review',true,7,'{"source":"firebase-export"}'),
  ('firebase','qFIrMYwSZ6N6eJpmGZx5A1tpUrj2','Agent 14','agent14@onspot.travel','agent','pending_review',false,0,'{"source":"firebase-export"}'),
  ('firebase','supervisor','Superviseur 2','','supervisor','pending_review',false,0,'{"source":"firebase-export"}'),
  ('firebase','undefined','John','','agent','pending_review',false,0,'{"source":"firebase-export"}')
on conflict (legacy_provider, legacy_account_id) do update set
  display_name = excluded.display_name,
  email = excluded.email,
  role = excluded.role,
  has_time_entries = excluded.has_time_entries,
  time_entries_count = excluded.time_entries_count,
  updated_at = now();
