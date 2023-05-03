import { RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { PipelineProject, BuildSpec, LinuxBuildImage } from 'aws-cdk-lib/aws-codebuild';
import { Repository as CodeCommitRepo } from 'aws-cdk-lib/aws-codecommit';
import { Artifact, Pipeline } from 'aws-cdk-lib/aws-codepipeline';
import { CodeBuildAction, CodeCommitSourceAction } from 'aws-cdk-lib/aws-codepipeline-actions';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { PROJECT_NAME } from '../shared/constants';
import { EnvironmentConfig } from '../shared/environment';

export class SimflexCloudBuildImage extends Stack {
  constructor(
    scope: Construct,
    id: string,
    reg: EnvironmentConfig,
    props: StackProps,
  ) {
    super(scope, id, props);

    const prefix = `${reg.pattern}-${reg.stage}-${PROJECT_NAME}-ecs-blue-green-deployments`;

    /**
     * Elastic Container Registry
     */
    const ecr = new Repository(this, `${prefix}-ecr`, {
      repositoryName: `${PROJECT_NAME}/ecs-blue-green-deployments`,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    /**
     * Codecommit for versioning project
     */
    const repo = new CodeCommitRepo(this, `${prefix}-repo`, {
      description: 'ECS Bule/Green deployments',
      repositoryName: 'ecs-blue-green-deployments',
    });

    /**
     * CodeBuild role to pull/push ECR and update lambda function code
     * The function is not from region of pipeline/build project
     */
    const role = new Role(this, `${prefix}-codebuild-role`, {
      roleName: `${prefix}-codebuild`,
      assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
    });

    ecr.grantPullPush(role);

    /**
     * Pipeline build docker image
     */
    const sourceOutput = new Artifact();

    const pipelineGreenProject = new PipelineProject(this, `${prefix}-codebuild-green`, {
      projectName: `${prefix}-codebuild-green`,
      description: 'Pipeline for building green docker image',
      buildSpec: BuildSpec.fromSourceFilename('./buildspec.yml'),
      environment: {
        privileged: true,
        buildImage: LinuxBuildImage.STANDARD_7_0,
      },
      environmentVariables: {
        IMAGE_REPO_NAME: { value: ecr.repositoryName },
        IMAGE_TAG: { value: 'testgreen' },
        AWS_ACCOUNT_ID: { value: reg.account },
        AWS_DEFAULT_REGION: { value: reg.region },
      },
      role: role,
    });

    const pipelineBlueProject = new PipelineProject(this, `${prefix}-codebuild-blue`, {
      projectName: `${prefix}-codebuild-blue`,
      description: 'Pipeline for building green docker image',
      buildSpec: BuildSpec.fromSourceFilename('./buildspec.yml'),
      environment: {
        privileged: true,
        buildImage: LinuxBuildImage.STANDARD_7_0,
      },
      environmentVariables: {
        IMAGE_REPO_NAME: { value: ecr.repositoryName },
        IMAGE_TAG: { value: 'testblue' },
        AWS_ACCOUNT_ID: { value: reg.account },
        AWS_DEFAULT_REGION: { value: reg.region },
      },
      role: role,
    });

    const pipelineBlue = new Pipeline(this, `${prefix}-build-image-blue`, {
      pipelineName: `testblue-${prefix}`,
    });

    pipelineBlue.addStage({
      stageName: 'Source',
      actions: [
        new CodeCommitSourceAction({
          actionName: 'CodeCommit',
          repository: repo,
          output: sourceOutput,
          branch: 'testblue',
        }),
      ],
    });

    pipelineBlue.addStage({
      stageName: 'Build',
      actions: [new CodeBuildAction({
        actionName: 'CodeBuild',
        project: pipelineGreenProject,
        input: sourceOutput,
      })],
    });

    const pipelineGreen = new Pipeline(this, `${prefix}-build-image-green`, {
      pipelineName: `testgreen-${prefix}`,
    });

    pipelineGreen.addStage({
      stageName: 'Source',
      actions: [
        new CodeCommitSourceAction({
          actionName: 'CodeCommit',
          repository: repo,
          output: sourceOutput,
          branch: 'testgreen',
        }),
      ],
    });

    pipelineGreen.addStage({
      stageName: 'Build',
      actions: [new CodeBuildAction({
        actionName: 'CodeBuild',
        project: pipelineBlueProject,
        input: sourceOutput,
      })],
    });
  }
}
