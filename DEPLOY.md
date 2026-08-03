# 🚀 ວິທີ Deploy ຂຶ້ນ GitHub + Vercel

ໂຄງສ້າງນີ້ຖືກປັບໃຫ້ເໝາະກັບ Vercel ໂດຍສະເພາະ (serverless functions ໃນ `/api`,
ຖານຂໍ້ມູນປ່ຽນຈາກ SQLite ໄຟລ໌ໃນເຄື່ອງ → **Turso** ເຊິ່ງເປັນ SQLite ແບບ hosted ທີ່ໃຊ້ໄດ້ຈາກ
serverless function, ຟຣີ, ແລະ **ຂໍ້ມູນຍັງແບ່ງປັນຮ່ວມກັນທຸກເຄື່ອງ** ຄືເດີມ).

> ⚠️ ເຫດຜົນທີ່ຕ້ອງປ່ຽນຈາກໂຄງສ້າງເດີມ (Express + SQLite ໄຟລ໌): Vercel ແມ່ນ serverless —
> disk ຂອງ function ບໍ່ຄົງທົນ (ephemeral), ຂຽນໄຟລ໌ SQLite ໄວ້ຈະຫາຍໄປລະຫວ່າງການເອີ້ນໃຊ້
> ຄັ້ງຕໍ່ໄປ. Turso ແກ້ບັນຫານີ້ໂດຍໃຫ້ຖານຂໍ້ມູນ SQLite ຢູ່ຄົງທີ່ຢູ່ນອກ function.

---

## ຂັ້ນຕອນທີ 1 — ສ້າງຖານຂໍ້ມູນ Turso (ຟຣີ)

1. ໄປທີ່ https://turso.tech ສະໝັກບັນຊີ (ໃຊ້ GitHub login ໄດ້ເລີຍ)
2. ສ້າງ database ໃໝ່ (ຕັ້ງຊື່ຫຍັງກໍ່ໄດ້ ເຊັ່ນ `receipt-reader`)
3. ຫຼັງສ້າງແລ້ວ, ຫາ:
   - **Database URL** (ຮູບແບບ `libsql://xxxxx.turso.io`)
   - **Auth Token** (ກົດ "Create Token" ຫຼື ໃຊ້ Turso CLI: `turso db tokens create receipt-reader`)
4. ຈົດ 2 ຄ່ານີ້ໄວ້ — ຈະໃຊ້ຢູ່ຂັ້ນຕອນທີ 4

*(ຖ້າຖະໜັດ CLI: `curl -sSfL https://get.tur.so/install.sh | bash` → `turso auth login` →
`turso db create receipt-reader` → `turso db show receipt-reader --url` → `turso db tokens create receipt-reader`)*

---

## ຂັ້ນຕອນທີ 2 — ຂຶ້ນ GitHub

```bash
cd receipt-reader-vercel
git init
git add .
git commit -m "Initial commit: receipt reader"
```

ໄປສ້າງ repository ໃໝ່ (ຫວ່າງເປົ່າ, ບໍ່ຕິກ README) ຢູ່ https://github.com/new ຈາກນັ້ນ:

```bash
git branch -M main
git remote add origin https://github.com/<ຊື່ບັນຊີ>/<ຊື່-repo>.git
git push -u origin main
```

> ໄຟລ໌ `.env` ຈະບໍ່ຖືກ commit ຂຶ້ນ (ບໍ່ມີຢູ່ໃນໂປຣເຈັກ, ມີແຕ່ `.env.example`) — ຄ່າລັບຕ່າງໆຈະໄປຕັ້ງຢູ່
> Vercel dashboard ໂດຍກົງໃນຂັ້ນຕອນຕໍ່ໄປ, ປອດໄພກວ່າ.

---

## ຂັ້ນຕອນທີ 3 — ນຳເຂົ້າ Vercel

1. ໄປ https://vercel.com → ລ໊ອກອິນດ້ວຍ GitHub
2. **Add New → Project** → ເລືອກ repository ທີ່ຫາກໍ່ push
3. Framework Preset: ປ່ອຍເປັນ **Other** (ບໍ່ຕ້ອງຕັ້ງ Build Command / Output Directory,
   Vercel ຈະກວດພົບ `/api` ແລະ `/public` ອັດຕະໂນມັດ)
4. **ຢ່າຫາກົດ Deploy ກ່ອນ** — ໄປໃສ່ Environment Variables ກ່ອນ (ຂັ້ນຕອນທີ 4)

---

## ຂັ້ນຕອນທີ 4 — ຕັ້ງ Environment Variables

ຢູ່ໜ້າ import project (ຫຼື ພາຍຫຼັງທີ່ **Settings → Environment Variables**) ໃສ່:

| Key | Value |
|---|---|
| `GEMINI_API_KEY` | API key ຈາກ https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | `gemini-2.0-flash` |
| `TURSO_DATABASE_URL` | ຄ່າຈາກຂັ້ນຕອນທີ 1 (ຂຶ້ນຕົ້ນດ້ວຍ `libsql://`) |
| `TURSO_AUTH_TOKEN` | ຄ່າຈາກຂັ້ນຕອນທີ 1 |
| `MATCH_THRESHOLD` | `0.45` |

ແລ້ວກົດ **Deploy**. ລໍຖ້າປະມານ 1 ນາທີ.

---

## ຂັ້ນຕອນທີ 5 — ໃຊ້ງານ

ຫຼັງ deploy ສຳເລັດ Vercel ຈະໃຫ້ URL ແບບ `https://<ຊື່-project>.vercel.app`
ເປີດ URL ນີ້ຈາກ POS, iPad, ຫຼື ຄອມພິວເຕີໃດກໍ່ໄດ້ທີ່ຕໍ່ອິນເຕີເນັດ — ທຸກເຄື່ອງຈະເຫັນ
ຄັງສິນຄ້າ ແລະ ປະຫວັດໃບບິນດຽວກັນ ເພາະໃຊ້ Turso database ດຽວກັນ.

ທຸກຄັ້ງທີ່ `git push` ຂຶ້ນ `main` ອີກ, Vercel ຈະ deploy ອັບເດດໃຫ້ອັດຕະໂນມັດ.

---

## ຂໍ້ຈຳກັດຄວນຮູ້ຂອງ Vercel (ແຜນຟຣີ / Hobby)

- **ຂະໜາດຮູບອັບໂຫລດ**: Vercel ຈຳກັດ request body ຂອງ serverless function ໄວ້ທີ່ 4.5MB
  ຢ່າງແໜ້ນອນ (ບໍ່ສາມາດຕັ້ງຄ່າຫຼີກລ່ຽງໄດ້). ລະບົບໄດ້ໃສ່ການບີບອັດຮູບຢູ່ browser ໃຫ້ອັດຕະໂນມັດແລ້ວ
  (resize + JPEG compress ກ່ອນສົ່ງ) ດັ່ງນັ້ນປົກກະຕິບໍ່ມີບັນຫາ, ແຕ່ຖ້າຮູບໃຫຍ່ຫຼາຍຫຼືສັນຍານອິນເຕີເນັດຊ້າ
  ອາດຕ້ອງຖ່າຍຮູບໃໝ່ໃຫ້ຄົມ ບໍ່ຈຳເປັນຕ້ອງຄວາມລະອຽດສູງທີ່ສຸດ
- **ເວລາປະມວນຜົນ**: ຕັ້ງໄວ້ໃນ `vercel.json` ໃຫ້ function `/api/analyze` ໃຊ້ໄດ້ເຖິງ 60 ວິນາທີ
  (ຄ່າສູງສຸດຂອງແຜນ Hobby ຟຣີ) — ພຽງພໍສຳລັບການວິເຄາະຮູບ 1 ໃບ
- **ແຜນ Hobby ຟຣີ ແມ່ນສຳລັບການໃຊ້ສ່ວນຕົວ/ບໍ່ຄ້າຂາຍ** ຕາມເງື່ອນໄຂຂອງ Vercel —
  ຖ້າໃຊ້ໃນຮ້ານ/ທຸລະກິດຈິງ ຄວນພິຈາລະນາອັບເປັນແຜນ Pro ($20/ເດືອນ)
- Turso ແຜນຟຣີ ພຽງພໍສຳລັບຮ້ານຂະໜາດນ້ອຍ-ກາງ (ຫຼາຍ GB storage, ຫຼາຍລ້ານ row reads/ເດືອນ)

## ການທົດສອບຢູ່ເຄື່ອງຕົນເອງກ່ອນ deploy (ບໍ່ບັງຄັບ)

```bash
npm install -g vercel
cd receipt-reader-vercel
vercel dev
```
ຈະຕ້ອງມີໄຟລ໌ `.env.local` (ຮູບແບບດຽວກັບ `.env.example`) ຢູ່ໃນ folder ດຽວກັນ ເພື່ອໃຫ້
`vercel dev` ອ່ານຄ່າ environment variables ໄດ້ຕອນທົດສອບໃນເຄື່ອງ.
