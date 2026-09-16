function deleteExpiredVisitors() {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const visitors = $app.findRecordsByFilter(
        'visitors',
        'created < {:cutoff}',
        '-created',
        200,
        0,
        { cutoff }
    );

    for (const visitor of visitors) {
        $app.delete(visitor);
    }
}

cronAdd('cleanup-visitors', '@daily', deleteExpiredVisitors);

onRecordCreateRequest((e) => {
    const headers = e.requestInfo().headers || {};
    const forwardedFor = typeof headers.x_forwarded_for === 'string'
        ? headers.x_forwarded_for
        : '';
    const forwardedIp = forwardedFor ? forwardedFor.split(',')[0].trim() : '';
    const realIp = typeof headers.x_real_ip === 'string' ? headers.x_real_ip : '';
    e.record.set('ip', forwardedIp || realIp || e.realIP());
    e.next();
});
