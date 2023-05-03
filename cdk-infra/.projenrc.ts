import { awscdk } from 'projen';
const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.77.0',
  defaultReleaseBranch: 'main',
  name: 'ecs-blue-green-deployments',
  projenrcTs: true,
  deps: ['env-var', 'dotenv'],
});
project.synth();