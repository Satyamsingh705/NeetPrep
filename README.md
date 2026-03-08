# NEET Mock Platform

Laptop-first NEET-style mock test platform built with Next.js, Prisma, Postgres, and cloud object storage for uploaded question assets.

## Features

- Admin uploads for text questions through JSON.
- Admin uploads for image questions through ZIP files with `q<number>_<answer>.png` naming.
- PDF page conversion to image questions with optional answer key input.
- Question metadata by subject, chapter, type, and correct answer.
- Test builder for official NEET pattern or custom practice tests.
- Student exam interface with question palette, timer, autosave, mark for review, and manual submission.
- Result dashboard with total marks, accuracy, subject-wise score, and question-wise analysis.

## Stack

- Next.js 16 with App Router and TypeScript
- Prisma ORM with Postgres
- Tailwind CSS v4
- Supabase Storage for uploaded PDFs and image-question assets in production

## Run

```bash
npm install
npm run db:push
npm run db:seed
npm run dev
```

## Environment

Create a `.env` file for local development:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require"
DIRECT_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require"
NEXT_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
SUPABASE_STORAGE_BUCKET="questions"
ADMIN_SESSION_SECRET="replace-with-a-long-random-secret"
STUDENT_SESSION_SECRET="replace-with-a-long-random-secret"

# Optional fallback locally if you still want Blob support.
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."
```

Storage resolution order:

1. Supabase Storage when `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set.
2. Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set.
3. Local `public/uploads` fallback when neither cloud storage provider is configured.

Create a public Supabase bucket named `questions` before uploading files.

## Upload Formats

### JSON text questions

```json
[
  {
    "subject": "PHYSICS",
    "chapter": "Kinematics",
    "prompt": "A sample text question",
    "options": [
      { "key": "A", "text": "Option A" },
      { "key": "B", "text": "Option B" },
      { "key": "C", "text": "Option C" },
      { "key": "D", "text": "Option D" }
    ],
    "correctAnswer": "B"
  }
]
```

### ZIP image questions

- Use filenames like `q12_B.png`.
- For multiple-correct image questions, use `q12_A_C.png` or `q12_A-C.png`.

### PDF upload

- Each PDF page is converted into one stored image question.
- Provide an optional comma-separated answer key if you want answers stored automatically.

## Notes

- NEET-pattern tests display 200 questions and evaluate only 180.
- In Section B, the first 10 answered questions per subject are evaluated.
- The demo seed creates a full NEET mock and a smaller biology drill.

## Supabase Storage Setup

1. Open your Supabase project.
2. Go to Storage.
3. Create a public bucket named `questions`.
4. Copy your project URL from Settings > API into `NEXT_PUBLIC_SUPABASE_URL`.
5. Copy your service role key from Settings > API into `SUPABASE_SERVICE_ROLE_KEY`.

Uploaded image questions and test-series PDFs will be stored in Supabase Storage, while Prisma keeps only the public URLs and metadata in Postgres.

## Deploy To Vercel

1. Push this repo to GitHub.
2. Create a Postgres database using Neon, Supabase, or Vercel Postgres.
3. In Vercel project settings, add `DATABASE_URL`.
4. Add `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally `SUPABASE_STORAGE_BUCKET`.
5. Add `ADMIN_SESSION_SECRET` and `STUDENT_SESSION_SECRET` with long random values.
6. Deploy the project on Vercel.
7. Run `npx prisma db push` once against the production database.
8. Optionally run `npm run db:seed` locally with the same `DATABASE_URL` if you want demo data.

This codebase keeps local file uploads as a fallback for development only. Production uploads require Supabase Storage or Vercel Blob because server file systems are ephemeral.