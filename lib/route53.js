const { getCloudFrontDomainName } = require("./cloudFront");
const {getCertificateArn, requestCertificateWithDNS} = require("./acm");

const entity = 'Fullstack'

const getHostedZoneForDomain = async (awsClient, domainName) => {
    const r53response = await awsClient.request('Route53', 'listHostedZones', {}),
        hostedZone = r53response.HostedZones
            .find(hostedZone => `${domainName}.`.includes(hostedZone.Name));

    if (!hostedZone) throw `Domain is not managed by AWS, you will have to add a record for ${domainName} manually.`;

    return hostedZone;
};

const checkChangeStatus = async (awsClient, changeInfo) => {
    const getChangeParams = {
            Id: changeInfo.Id
        },
        getChangeResponse = await awsClient.request('Route53', 'getChange', getChangeParams);

    return getChangeResponse.ChangeInfo.Status === 'INSYNC';
};

const waitForChange = async (checkChange) => {
    const isChangeComplete = await checkChange();

    if (isChangeComplete) {
        return isChangeComplete
    } else {
        await new Promise(r => setTimeout(r, 1000));
        return await waitForChange(checkChange, serverless);
    };
};

const entryExists = async (awsClient, hostedZone, domainName, target) => {
    const requestParams = {
            HostedZoneId: hostedZone.Id
        },
        r53response = await awsClient.request('Route53', 'listResourceRecordSets', requestParams)
        sets = r53response.ResourceRecordSets;
        
    return sets.find(set => set.Name === `${domainName}.` && set.AliasTarget?.DNSName === `${target}.`);
}

const addAliasRecord = async (serverless, domainName) => {
    const awsClient = serverless.getProvider('aws')
        target = await getCloudFrontDomainName(serverless),
        hostedZone = await getHostedZoneForDomain(awsClient, domainName);

    if (await entryExists(awsClient, hostedZone, domainName, target)) return;

    serverless.cli.log(`Adding ALIAS record for ${domainName} to point to ${target}...`, entity);

    const changeRecordParams = {
            HostedZoneId: hostedZone.Id,
            ChangeBatch: {
                Changes: [
                    {
                        Action: 'UPSERT',
                        ResourceRecordSet: {
                            Name: domainName,
                            Type: 'A',
                            AliasTarget: {
                                HostedZoneId: 'Z2FDTNDATAQYW2', // global CloudFront HostedZoneId
                                DNSName: target,
                                EvaluateTargetHealth: false
                            }
                        }
                    }
                ]
            }
        },
        changeRecordResult = await awsClient.request('Route53', 'changeResourceRecordSets', changeRecordParams);
    
    // wait for DNS entry
    await waitForChange(() => checkChangeStatus(awsClient, changeRecordResult.ChangeInfo));

    serverless.cli.log(`ALIAS ${domainName} -> ${target} successfully added.`, entity);

    // waitFor can't be called using Provider.request yet
    /*
    waitForRecordParams = {
        Id: changeRecordResult.ChangeInfo.Id
    },
    
    {err, waitForRecordResult} = await awsClient.request('Route53', 'waitFor', 'resourceRecordSetsChanged', waitForRecordParams)

    serverless.cli.log(err)
    serverless.cli.log(waitForRecordResult)
    */    
};

const setupCertificate = async (serverless, domainName) => {
    const existingCertificateArn = await getCertificateArn(serverless, domainName);
    if (existingCertificateArn) return existingCertificateArn;

    serverless.cli.log(`Requesting certificate for ${domainName}...`, entity);

    const awsClient = serverless.getProvider('aws')
        hostedZone = await getHostedZoneForDomain(awsClient, domainName),
        getCertificateRecord = async (serverless, domainName) => {
            const certificaterequest = await requestCertificateWithDNS(serverless, domainName);
            return certificaterequest.DomainValidationOptions[0].ResourceRecord
        },
        // sometimes the ResourceRecord entry isn't immediately available, so we wait until it is
        certificateResourceRecord = await waitForChange(() => getCertificateRecord(serverless, domainName)),
        changeRecordParams = {
            HostedZoneId: hostedZone.Id,
            ChangeBatch: {
                Changes: [
                    {
                        Action: 'UPSERT',
                        ResourceRecordSet: {
                            Name: certificateResourceRecord.Name,
                            Type: certificateResourceRecord.Type,
                            TTL: 60,
                            ResourceRecords: [
                                {
                                    Value: certificateResourceRecord.Value
                                }
                            ]
                        }
                    }
                ]
            }
        },
        changeRecordResult = await awsClient.request('Route53', 'changeResourceRecordSets', changeRecordParams);

    // wait for DNS entry
    await waitForChange(() => checkChangeStatus(awsClient, changeRecordResult.ChangeInfo));

    // wait for issued certificate
    const certificateArn = await waitForChange(() => getCertificateArn(serverless, domainName));
    serverless.cli.log(`Certificate for ${domainName} successfully issued.`, entity);
    return certificateArn;
};

module.exports = {
    addAliasRecord,
    setupCertificate
};