import { Injectable } from '@nestjs/common';
import * as ejs from 'ejs';
import * as puppeteer from 'puppeteer';
import * as path from 'path';
import { join } from 'path';

export interface PrescriptionData {
    clinicNameHindi: string;
    clinicNameEnglish: string;
    clinicSubtitle: string;
    clinicPhone: string;
    clinicAddress: string;
    timingTitle: string;
    morningTiming: string;
    eveningTiming: string;
    doctors: Array<{
        name: string;
        degree: string;
        specialty: string;
        regNo: string;
        type: string;
    }>;
    doctorName: string;
    doctorRegistration: string;
    patientName: string;
    patientAge: number;
    patientGender: string;
    visitId: string;
    visitDate: string;
    medications: Array<{
        drugName: string;
        dosage: string;
        frequency?: string;
        timing?: string;
        duration?: string;
        instructions?: string;
    }>;
    notes?: string;
    footerText?: string;
}

@Injectable()
export class PdfService {
    /**
     * Generate prescription PDF from data
     * @param data Prescription data
     * @returns PDF as Buffer
     */
    async generatePrescriptionPDF(data: PrescriptionData): Promise<Buffer> {
        try {
            // Render EJS template
            const templatePath = path.join(__dirname, '../../prescriptions/templates/prescription.ejs');
            const html = await ejs.renderFile(templatePath, data);
            const executablePath = join(
                process.cwd(),                     // Project root
                '.cache',
                'puppeteer',
                'chrome',
                'linux-143.0.7499.169',            // <-- Update if your build logs show a different version
                'chrome-linux64',
                'chrome'
            );

            // Launch Puppeteer
            const browser = await puppeteer.launch({
                executablePath,
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
            });

            const page = await browser.newPage();

            // Set content with relaxed wait condition and increased timeout
            await page.setContent(html, {
                waitUntil: ['load', 'domcontentloaded'],
                timeout: 60000
            });

            // Explicitly wait for fonts to be loaded (crucial for Hindi fonts)
            await page.evaluateHandle('document.fonts.ready');

            // Generate PDF
            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
            });

            await browser.close();

            return Buffer.from(pdfBuffer);
        } catch (error) {
            throw new Error(`Failed to generate PDF: ${error.message}`);
        }
    }
}
