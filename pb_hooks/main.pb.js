onRecordCreateRequest((e) => {
    if (e.record.collection().name !== 'visitors') {
        return e.next();
    }

    e.record.set('ip', e.request.remoteIP());
    e.record.set('userAgent', e.request.header.get('User-Agent') || '');
    e.record.set('referer', e.request.header.get('Referer') || '');
    e.record.set('acceptLanguage', e.request.header.get('Accept-Language') || '');
    e.next();
});
