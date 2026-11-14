/**
 * worker.js
 * محرك المعالجة الخلفية (Background Queue & Auto-Sync Engine)
 * يدير استقبال البلاغات، جدولة الإرسال، وإعادة المحاولة عند انقطاع الاتصال
 */

export class BackgroundReportWorker {
    constructor(connectors, onStateUpdated, onLogEvent) {
        this.connectors = connectors;
        this.onStateUpdated = onStateUpdated;
        this.onLogEvent = onLogEvent;
        this.reports = JSON.parse(localStorage.getItem('rs_reports_db') || '[]');
        this.queue = JSON.parse(localStorage.getItem('rs_pending_queue') || '[]');
        this.isProcessing = false;
        this.syncIntervalId = null;
    }

    saveDatabase() {
        localStorage.setItem('rs_reports_db', JSON.stringify(this.reports));
        localStorage.setItem('rs_pending_queue', JSON.stringify(this.queue));
        if (this.onStateUpdated) {
            this.onStateUpdated(this.reports, this.queue);
        }
    }

    log(level, message, meta = '') {
        const entry = {
            time: new Date().toLocaleTimeString('en-GB', { hour12: false }),
            level,
            message,
            meta
        };
        if (this.onLogEvent) this.onLogEvent(entry);
    }

    /**
     * استقبال بلاغ جديد وإدخاله إلى طابور المعالجة الخلفية
     */
    async enqueueReport(rawInput) {
        const report = {
            id: `RPT-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`,
            platform: rawInput.platform,
            targetType: rawInput.targetType,
            handle: rawInput.handle.trim(),
            url: rawInput.url.trim(),
            violation: rawInput.violation,
            notes: rawInput.notes.trim(),
            status: 'queued', // queued | synced | closed | failed
            githubIssueNumber: null,
            githubIssueUrl: null,
            webhookStatus: null,
            telegramStatus: null,
            createdAt: new Date().toISOString()
        };

        this.reports.unshift(report);
        this.queue.push(report.id);
        this.saveDatabase();
        this.log('INFO', `تم استقبال البلاغ [${report.id}] وإضافته لطابور الخلفية.`);

        // تشغيل المعالج فوراً
        await this.processQueue();
        return report;
    }

    /**
     * معالجة الطابور في الخلفية وإرسال البيانات لجميع القنوات المربوطة
     */
    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;
        this.isProcessing = true;

        while (this.queue.length > 0) {
            const reportId = this.queue[0];
            const report = this.reports.find(r => r.id === reportId);

            if (!report) {
                this.queue.shift();
                continue;
            }

            try {
                const legalNotice = this.connectors.generateLegalNotice(report);
                let hasAnyIntegration = false;

                // 1. الرفع إلى GitHub Issues
                if (this.connectors.githubConfig?.token) {
                    hasAnyIntegration = true;
                    const ghRes = await this.connectors.pushReportToGitHub(report);
                    report.githubIssueNumber = ghRes.issueNumber;
                    report.githubIssueUrl = ghRes.issueUrl;
                    report.status = 'synced';
                    this.log('SUCCESS', `تم إنشاء تذكرة GitHub #${ghRes.issueNumber} للبلاغ ${report.id}`, `HTTP ${ghRes.httpStatus}`);
                }

                // 2. الإرسال إلى Webhook خارجي (n8n / Make)
                if (this.connectors.webhookConfig?.webhookUrl) {
                    hasAnyIntegration = true;
                    const whRes = await this.connectors.dispatchWebhook(report, legalNotice);
                    report.webhookStatus = whRes.status;
                    this.log('SUCCESS', `تم إرسال Webhook للبلاغ ${report.id}`, `HTTP ${whRes.status}`);
                }

                // 3. الإرسال إلى Telegram Bot
                if (this.connectors.webhookConfig?.telegramBotToken && this.connectors.webhookConfig?.telegramChatId) {
                    hasAnyIntegration = true;
                    const tgRes = await this.connectors.dispatchTelegramAlert(report);
                    report.telegramStatus = tgRes.status;
                    this.log('SUCCESS', `تم إرسال تنبيه Telegram للبلاغ ${report.id}`, `HTTP ${tgRes.status}`);
                }

                if (!hasAnyIntegration) {
                    report.status = 'ready';
                    this.log('WARN', `البلاغ ${report.id} جاهز للإرسال الرسمي (لم يتم ربط GitHub أو Webhook بعد).`);
                }

                // إزالة البلاغ من الطابور بعد نجاح المعالجة
                this.queue.shift();
                this.saveDatabase();

            } catch (error) {
                report.status = 'failed';
                this.log('ERROR', `فشل معالجة البلاغ ${report.id}: ${error.message}`);
                // إخراجه من الحلقة الحالية لتجنب التجميد مع إبقائه قابلاً لإعادة المحاولة يدوياً
                this.queue.shift();
                this.saveDatabase();
            }
        }

        this.isProcessing = false;
    }

    /**
     * مزامنة الحالات مع مستودع GitHub (سحب إغلاق التذاكر أو التذاكر الجديدة)
     */
    async syncWithGitHub() {
        if (!this.connectors.githubConfig?.token) {
            this.log('WARN', 'تعذرت المزامنة: يرجى إعداد ربط GitHub أولاً.');
            return;
        }
        try {
            this.log('INFO', 'بدء المزامنة الخلفية مع GitHub REST API...');
            const issues = await this.connectors.fetchGitHubIssues();
            let updatedCount = 0;

            for (const issue of issues) {
                if (issue.pull_request) continue;
                const localReport = this.reports.find(r => r.githubIssueNumber === issue.number);
                if (localReport) {
                    const newStatus = issue.state === 'closed' ? 'closed' : 'synced';
                    if (localReport.status !== newStatus) {
                        localReport.status = newStatus;
                        updatedCount++;
                    }
                }
            }

            this.saveDatabase();
            this.log('SUCCESS', `اكتملت المزامنة مع GitHub. التذاكر المفحوصة: ${issues.length} | التحديثات: ${updatedCount}`);
        } catch (err) {
            this.log('ERROR', `خطأ أثناء مزامنة GitHub: ${err.message}`);
        }
    }

    /**
     * تفعيل المراقبة الدورية في الخلفية كل 60 ثانية
     */
    startAutoSync(intervalMs = 60000) {
        if (this.syncIntervalId) clearInterval(this.syncIntervalId);
        this.syncIntervalId = setInterval(() => {
            if (this.queue.length > 0) this.processQueue();
            if (this.connectors.githubConfig?.token) this.syncWithGitHub();
        }, intervalMs);
        this.log('INFO', `محرك الخلفية نشط (المزامنة التلقائية كل ${intervalMs / 1000} ثانية).`);
    }

    deleteReport(id) {
        this.reports = this.reports.filter(r => r.id !== id);
        this.queue = this.queue.filter(qId => qId !== id);
        this.saveDatabase();
        this.log('INFO', `تم حذف السجل ${id} من قاعدة البيانات المحلية.`);
    }

    retryReport(id) {
        const report = this.reports.find(r => r.id === id);
        if (report && !this.queue.includes(id)) {
            report.status = 'queued';
            this.queue.push(id);
            this.saveDatabase();
            this.processQueue();
        }
    }
}
