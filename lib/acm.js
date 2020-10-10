const getCertificateArn = async (serverless, domainName) => {
    const awsClient = serverless.getProvider('aws'),
        requestParams = {
            CertificateStatuses: ['ISSUED']
        },
        listCertificatesResponse = await awsClient.request('ACM', 'listCertificates', requestParams),
        certificate = listCertificatesResponse.CertificateSummaryList
            .find(certificate => certificate.DomainName === domainName);

    return certificate ? certificate.CertificateArn : null;
}

const requestCertificateWithDNS = async (serverless, domainName) => {
    const awsClient = serverless.getProvider('aws'),
        requestCertificateParams = {
            DomainName: domainName,
            ValidationMethod: 'DNS'
        },
        requestCertificateResponse = await awsClient.request('ACM', 'requestCertificate', requestCertificateParams),
        describeCertificateParams = {
            CertificateArn: requestCertificateResponse.CertificateArn
        },
        describeCertificateResponse = await awsClient.request('ACM', 'describeCertificate', describeCertificateParams);

    return describeCertificateResponse.Certificate;
}

module.exports = {
    getCertificateArn,
    requestCertificateWithDNS
}