const _ = require('lodash');

const getStsClient = async (serverless, roleArn) => {
    const awsClient = serverless.getProvider('aws'),
        requestParams = {
            RoleArn: roleArn,
            RoleSessionName: 'serverless-plugin-sts-test'
        },
        sts_response = await awsClient.request('STS', 'assumeRole', requestParams),
        awsStsClient = _.cloneDeep(awsClient);

    awsStsClient.cachedCredentials.credentials.accessKeyId = sts_response.Credentials.AccessKeyId;
    awsStsClient.cachedCredentials.credentials.secretAccessKey = sts_response.Credentials.SecretAccessKey;
    awsStsClient.cachedCredentials.credentials.sessionToken = sts_response.Credentials.SessionToken;

    return awsStsClient;
};

module.exports = getStsClient;