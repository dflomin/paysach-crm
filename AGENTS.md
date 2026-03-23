# UCC Lead Dialer CRM - Master Build Plan

## Project Overview
A specialized, high-velocity CRM for processing UCC (Uniform Commercial Code) loan data. 

**Tech Stack:** Next.js (App Router), Tailwind CSS, shadcn/ui, NextAuth.js (Google OAuth), MariaDB.

## Environment & Database Configuration
```env
DATABASE_URL="mysql://user:password@host:port/uccleads"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your_generated_secret_string"
GOOGLE_CLIENT_ID="your_google_client_id"
GOOGLE_CLIENT_SECRET="your_google_client_secret"
```