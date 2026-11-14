/**
 * connectors.js
 * وحدة الربط بالمنصات الرسمية، GitHub REST API، والخدمات الخارجية (Webhooks / Telegram)
 * يعمل ببيانات حقيقية 100% دون أي محاكاة
 */

export const PLATFORM_ENDPOINTS = {
    x: {
        name: "X (Twitter)",
        email: "support@x.com",
        forms: {
            impersonation: "https://help.x.com/en/forms/authenticity/impersonation",
            copyright: "https://help.x.com/en/forms/ipi",
            extortion: "https://help.x.com/en/forms/safety-and-sensitive-content/private-information",
            violence: "https://help.x.com/en/forms/safety-and-sensitive-content/violent-threats",
            spam: "https://help.x.com/en/forms/platform-manipulation"
        }
    },
    facebook: {
        name: "Facebook (Meta)",
        email: "abuse@fb.com",
        forms: {
            impersonation: "https://www.facebook.com/help/contact/295309487309948",
            copyright: "https://www.facebook.com/help/contact/1758255661104383",
            extortion: "https://www.facebook.com/help/contact/567360146613371",
            violence: "https://www.facebook.com/help/285881641526716",
            spam: "https://www.facebook.com/help/263149623790594"
        }
    },
    instagram: {
        name: "Instagram (Meta)",
        email: "support@instagram.com",
        forms: {
            impersonation: "https://help.instagram.com/contact/636276399721841",
            copyright: "https://help.instagram.com/contact/552695131608132",
            extortion: "https://help.instagram.com/contact/383679321740945",
            violence: "https://help.instagram.com/contact/383679321740945",
            spam: "https://help.instagram.com/192435014247952"
        }
    },
    tiktok: {
        name: "TikTok",
        email: "legal@tiktok.com",
        forms: {
            impersonation: "https://www.tiktok.com/legal/report/impersonation",
            copyright: "https://www.tiktok.com/legal/report/Copyright",
            extortion: "https://www.tiktok.com/legal/report/privacy",
            violence: "https://www.tiktok.com/legal/report/feedback",
            spam: "https://www.tiktok.com/legal/report/feedback"
        }
    },
    youtube: {
        name: "YouTube (Google)",
        email: "copyright@youtube.com",
        forms: {
            impersonation: "https://support.google.com/youtube/answer/2801947",
            copyright: "https://www.youtube.com/copyright_complaint_form",
            extortion: "https://support.google.com/youtube/answer/2801895",
            violence: "https://support.google.com/youtube/answer/2802027",
            spam: "https://support.google.com/youtube/answer/2802027"
        }
    },
    telegram: {
        name: "Telegram",
        email: "abuse@telegram.org",
        forms: {
            impersonation: "https://telegram.org/support",
            copyright: "mailto:dmca@telegram.org",
            extortion: "mailto:abuse@telegram.org",
            violence: "mailto:stopCA@telegram.org",
            spam: "mailto:abuse@telegram.org"
        }
    },
    snapchat: {
        name: "Snapchat",
        email: "safety@snapchat.com",
        forms: {
            impersonation: "https://help.snapchat.com/hc/en-us/requests/new?co=true&ticket_form_id=149423",
            copyright: "https://help.snapchat.com/hc/en-us/requests/new?co=true&ticket_form_id=149423",
            extortion: "https://help.snapchat.com/hc/en-us/requests/new?co=true&ticket_form_id=149423",
            violence: "https://help.snapchat.com/hc/en-us/requests/new?co=true&ticket_form_id=149423",
            spam: "https://help.snapchat.com/hc/en-us/requests/new?co=true&ticket_form_id=149423"
        }
    }
};

export const VIOLATION_LABELS = {
    impersonation: { ar: "انتحال شخصية / هوية مزيفة", en: "Impersonation & Identity Theft" },
    copyright: { ar: "انتهاك حقوق الملكية الفكرية (DMCA)", en: "Copyright Infringement (DMCA)" },
    extortion: { ar: "ابتزاز أو نشر بيانات خاصة", en: "Extortion / Doxxing / Privacy Violation" },
    violence: { ar: "تحريض على العنف أو خطاب كراهية", en: "Violent Threats / Hate Speech" },
    spam: { ar: "احتيال إلكتروني أو حسابات وهمية", en: "Fraud / Phishing / Coordinated Spam" }
};

export class ExternalConnectors {
    constructor() {
        this.githubConfig = JSON.parse(localStorage.getItem('rs_github_cfg') || 'null');
        this.webhookConfig = JSON.parse(localStorage.getItem('rs_webhook_cfg') || 'null');
    }

    saveGitHubConfig(owner, repo, token) {
        this.githubConfig = { owner: owner.trim(), repo: repo.trim(), token: token.trim() };
        localStorage.setItem('rs_github_cfg', JSON.stringify(this.githubConfig));
    }

    saveWebhookConfig(webhookUrl, telegramBotToken, telegramChatId) {
        this.webhookConfig = {
            webhookUrl: webhookUrl.trim(),
            telegramBotToken: telegramBotToken.trim(),
            telegramChatId: telegramChatId.trim()
        };
        localStorage.setItem('rs_webhook_cfg', JSON.stringify(this.webhookConfig));
    }

    /**
     * التحقق الفعلي من الاتصال بمستودع GitHub
     */
    async verifyGitHubConnection() {
        if (!this.githubConfig || !this.githubConfig.owner || !this.githubConfig.repo || !this.githubConfig.token) {
            throw new Error("إعدادات GitHub غير مكتملة.");
        }
        const { owner, repo, token } = this.githubConfig;
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(`HTTP ${response.status}: ${err.message || 'فشل المصادقة مع المستودع'}`);
        }
        return await response.json();
    }

    /**
     * رفع البلاغ كـ GitHub Issue حقيقي في المستودع
     */
    async pushReportToGitHub(report) {
        if (!this.githubConfig?.token) return null;
        const { owner, repo, token } = this.githubConfig;
        const platformInfo = PLATFORM_ENDPOINTS[report.platform];
        const violationInfo = VIOLATION_LABELS[report.violation];

        const issueBody = `
### تفاصيل البلاغ الرقمي الموثق
- **الرقم المرجعي:** \`${report.id}\`
- **المنصة المستهدفة:** ${platformInfo.name}
- **نوع الهدف:** ${report.targetType}
- **معرف الحساب:** \`${report.handle || 'غير محدد'}\`
- **الرابط المباشر:** ${report.url}
- **تصنيف المخالفة:** ${violationInfo.ar} (${violationInfo.en})
- **تاريخ الرصد (UTC):** ${report.createdAt}

#### ملخص الأدلة والوقائع:
> ${report.notes || 'لا توجد ملاحظات إضافية'}

---
*تم إنشاء هذه التذكرة آلياً عبر نظام إدارة وأتمتة البلاغات.*
        `.trim();

        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json',
                'X-GitHub-Api-Version': '2022-11-28'
            },
            body: JSON.stringify({
                title: `[${platformInfo.name}] بلاغ ${violationInfo.ar} - ${report.handle || report.id}`,
                body: issueBody,
                labels: ['report-system', report.platform, report.violation]
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(`GitHub API HTTP ${response.status}: ${err.message || 'خطأ في إنشاء التذكرة'}`);
        }

        const data = await response.json();
        return {
            issueNumber: data.number,
            issueUrl: data.html_url,
            state: data.state,
            httpStatus: response.status
        };
    }

    /**
     * جلب التذاكر الفعلية من GitHub لمزامنة الحالات
     */
    async fetchGitHubIssues() {
        if (!this.githubConfig?.token) return [];
        const { owner, repo, token } = this.githubConfig;
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=100`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: تعذر سحب التذاكر من GitHub`);
        }
        return await response.json();
    }

    /**
     * إرسال إشعار فوري حقيقي إلى Webhook خارجي (n8n / Make / Discord)
     */
    async dispatchWebhook(report, legalNotice) {
        if (!this.webhookConfig?.webhookUrl) return null;
        const response = await fetch(this.webhookConfig.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event: 'NEW_DIGITAL_REPORT',
                timestamp: new Date().toISOString(),
                report,
                legalNotice
            })
        });
        return { status: response.status, ok: response.ok };
    }

    /**
     * إرسال إشعار مباشر عبر Telegram Bot API
     */
    async dispatchTelegramAlert(report) {
        const { telegramBotToken, telegramChatId } = this.webhookConfig || {};
        if (!telegramBotToken || !telegramChatId) return null;

        const platformInfo = PLATFORM_ENDPOINTS[report.platform];
        const violationInfo = VIOLATION_LABELS[report.violation];
        const text = `🚨 *بلاغ رقمي جديد مسجل*\n\n` +
            `• *المرجع:* \`${report.id}\`\n` +
            `• *المنصة:* ${platformInfo.name}\n` +
            `• *النوع:* ${violationInfo.ar}\n` +
            `• *الهدف:* ${report.url}\n` +
            `• *التوقيت:* ${report.createdAt}`;

        const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: telegramChatId,
                text,
                parse_mode: 'Markdown'
            })
        });
        return { status: response.status, ok: response.ok };
    }

    /**
     * توليد خطاب قانوني مزدوج اللغة (عربي / إنجليزي)
     */
    generateLegalNotice(report) {
        const platform = PLATFORM_ENDPOINTS[report.platform];
        const violation = VIOLATION_LABELS[report.violation];
        return {
            subject: `Official Abuse & Policy Violation Report [Ref: ${report.id}] - ${violation.en}`,
            toEmail: platform.email,
            officialFormUrl: platform.forms[report.violation] || Object.values(platform.forms)[0],
            body: `To: ${platform.name} Trust, Safety & Legal Compliance Team (${platform.email})
Reference ID: ${report.id}
Date (UTC): ${report.createdAt}

SUBJECT: Formal Request for Immediate Content/Account Removal (${violation.en})

Dear Trust & Safety Team,
We are formally reporting a severe violation of ${platform.name}'s Terms of Service and Community Guidelines:
- Target Type: ${report.targetType}
- Target Handle: ${report.handle || 'N/A'}
- Violating URL: ${report.url}
- Violation Category: ${violation.en}
- Evidence Summary: ${report.notes || 'Direct policy violation documented at the URL above.'}

Please review this case urgently and execute permanent removal in accordance with your platform safety policies.

--------------------------------------------------

إلى: فريق الثقة والأمان والشؤون القانونية في منصة ${platform.name}
الرقم المرجعي للبلاغ: ${report.id}
تاريخ الرصد (UTC): ${report.createdAt}

الموضوع: بلاغ رسمي وطلب إزالة فورية لمخالفة سياسات الاستخدام (${violation.ar})

تحية طيبة وبعد،
نتقدم إليكم بهذا البلاغ الرسمي بخصوص رصد محتوى/حساب ينتهك شروط الخدمة ومعايير المجتمع الخاصة بمنصتكم:
- نوع الهدف: ${report.targetType}
- معرف الحساب: ${report.handle || 'غير محدد'}
- الرابط المباشر للمخالفة: ${report.url}
- تصنيف الانتهاك: ${violation.ar}
- ملخص الأدلة: ${report.notes || 'مخالفة صريحة موثقة عبر الرابط المرفق أعلاه.'}

نرجو اتخاذ الإجراءات اللازمة لمراجعة البلاغ وإزالة المحتوى المخالف بشكل عاجل.`
        };
    }
}
