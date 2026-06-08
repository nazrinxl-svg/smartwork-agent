# SmartWork Agent Memory: SIAGA Flow

SmartWork SIAGA module uses a user intake model.

User fills:
- teacher/account identity
- SIAGA credential locally
- target month
- target year
- holidays
- leave/cuti/izin/sakit days

User does not fill jam masuk/jam pulang. SIAGA time rules are system-owned:
- normal masuk random 06:50-07:00
- normal pulang Senin-Kamis random 14:15-14:30
- Friday pulang random 11:30-11:35
- Saturday pulang random 15:15-15:30
- Sunday skipped
- holidays/cuti skipped by default

Safety:
- no credential in chat
- no save/submit/delete without explicit confirmation
- preview before execution
- strict target month/year detection
- wrong month guard required
- multi-account must discover detail IDs per account, not hardcode one ID
