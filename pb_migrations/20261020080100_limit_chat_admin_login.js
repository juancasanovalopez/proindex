/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
    const settings = app.settings();
    settings.rateLimits.enabled = true;
    const rules = settings.rateLimits.rules;
    for (const action of ['auth-with-password', 'request-otp', 'auth-with-otp']) {
        const label = `POST /api/collections/_superusers/${action}`;
        if (!rules.some(rule => rule.label === label)) {
            rules.push({ label, audience: '', duration: 60, maxRequests: 5 });
        }
    }
    settings.rateLimits.rules = rules;
    app.save(settings);
});
