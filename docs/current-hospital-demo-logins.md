# Current NITK demo hospital accounts

Use the account selector in the header. Every supplied facility has its own account and canonical hospital scope. These are synthetic demonstration accounts, not real hospital credentials.

Demo password: `demo123`. The old St. Jude and Bayview accounts have been retired.

| Hospital | Demo email |
|---|---|
| NITK Health Care Centre | `nitk_hcc@goldenhour.test` |
| Srinivas Institute of Medical Sciences and Research Centre | `srinivas_mukka@goldenhour.test` |
| Padmavathi Hospital | `padmavathi_surathkal@goldenhour.test` |
| Chirashree Nursing Home | `chirashree_surathkal@goldenhour.test` |
| A.J. Hospital and Research Centre | `aj_hospital_mangaluru@goldenhour.test` |
| University Medical Center (KMC Hospital) | `kmc_attavar@goldenhour.test` |
| Mangalore Nursing Home | `mangalore_nursing_home@goldenhour.test` |
| Unity Hospital | `unity_hospital@goldenhour.test` |
| Indiana Hospital and Heart Institute | `indiana_heart_mangaluru@goldenhour.test` |
| Father Muller Medical College Hospital | `father_muller_mangaluru@goldenhour.test` |
| Yenepoya Medical College Hospital | `yenepoya_deralakatte@goldenhour.test` |
| Surathkal Government Hospital | `surathkal_government_hospital@goldenhour.test` |
| Misquith and Rao's Hospital | `misquith_rao_hospital@goldenhour.test` |
| Venus Hospital | `venus_hospital_surathkal@goldenhour.test` |
| Government Wenlock Hospital | `govt_wenlock_mangaluru@goldenhour.test` |
| ESI Hospital | `esi_hospital_mangaluru@goldenhour.test` |
| Diddy's Hospital | `diddys_hospital_mangaluru@goldenhour.test` |
| Lady Goshan Hospital | `lady_goshan_hospital@goldenhour.test` |
| Rama Sakti Mission Charitable Hospital | `rama_sakti_charitable_hospital@goldenhour.test` |
| SCS Hospital | `scs_hospital_mangaluru@goldenhour.test` |
| First Neuro Hospital | `first_neuro_hospital@goldenhour.test` |
| Colaco Hospital | `colaco_hospital_mangaluru@goldenhour.test` |
| City Hospital Research and Diagnostic Center | `city_hospital_mangaluru@goldenhour.test` |

Restart the API after changing seed/account code, then refresh the browser. An old signed-in hospital session will need a fresh login. The application still uses its existing in-memory business store; this change does not migrate it to PostgreSQL.

Google Maps JavaScript renders the map. Google Routes validates regional driving access using the existing server-side key. If Routes is unavailable, pin validation is limited to the explicitly labelled demo road segments; it does not claim whole-region road coverage.
