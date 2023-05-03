import { StackProps, Stage } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { SimflexCloudBuildImage } from './pipeline-build-image';
import { EcsBlueGreenDeploymentsStack } from '../ecs';
import { EnvironmentConfig } from '../shared/environment';
import { TagsProp } from '../shared/tagging';

export class EcsBlueGreenDeploymentsPipelineStage extends Stage {
  constructor(
    scope: Construct,
    id: string,
    reg: EnvironmentConfig,
    props?: StackProps,
  ) {
    super(scope, id, props);

    new SimflexCloudBuildImage(this, 'simflexcloud-ecs-blue-green-deployments-build-image', reg, { env: reg, tags: TagsProp('build-image', reg) });

    new EcsBlueGreenDeploymentsStack(this, 'EcsBlueGreenDeploymentsStack', reg, { env: reg, tags: TagsProp('build-image', reg) });
  }
}
