# SpendIQ – Smart Financial Insights Dashboard

SpendIQ is a client-side web application that analyzes financial
transaction statements (PDF, CSV, TXT) to generate structured
summaries and spending insights.

## Features
- Upload and parse transaction statements
- Detect credits, debits, and net balance
- Category-wise transaction analysis
- Interactive dashboard with tables and charts
- Client-side processing using JavaScript

## Tech Stack
- HTML
- CSS
- JavaScript
- PDF.js

## System Overview
1. Reads user-uploaded files
2. Extracts and normalizes transaction text
3. Identifies transaction details (date, amount, type)
4. Aggregates data for insights and visualization
5. Displays results in a browser-based dashboard

## Note
All processing happens locally in the browser. No data is stored or transmitted.
