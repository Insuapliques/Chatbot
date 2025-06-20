import { google } from 'googleapis';
import fs from 'fs';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT = JSON.parse(fs.readFileSync('google-credentials.json'));
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const auth = new google.auth.GoogleAuth({
    credentials: GOOGLE_SERVICE_ACCOUNT,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

export async function getResponseFromSheet(keyword) {
    try {
        const range = 'Respuestas!A:B';
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SHEET_ID,
            range,
        });
        const rows = response.data.values;
        if (!rows) return null;

        for (let row of rows) {
            if (row[0].toLowerCase() === keyword.toLowerCase()) {
                return row[1];
            }
        }
        return null;
    } catch (error) {
        console.error('Error obteniendo datos de Google Sheets:', error);
        return null;
    }
}

export async function getResponseFromChatGPT(prompt) {
    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'system', content: 'You are a helpful chatbot.' }, { role: 'user', content: prompt }],
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('Error al obtener respuesta de ChatGPT:', error);
        return 'Lo siento, no puedo responder en este momento.';
    }
}
