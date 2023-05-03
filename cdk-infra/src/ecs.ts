import { Stack, StackProps } from 'aws-cdk-lib';
import { AutoScalingGroup } from 'aws-cdk-lib/aws-autoscaling';
import { InstanceClass, InstanceSize, InstanceType, Peer, Port, SecurityGroup, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { AppProtocol, AsgCapacityProvider, Cluster, Compatibility, ContainerImage, Ec2Service, EcsOptimizedImage, Protocol, TaskDefinition } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancer, ApplicationProtocol } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { ManagedPolicy, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { PROJECT_NAME } from './shared/constants';
import { EnvironmentConfig } from './shared/environment';

export class EcsBlueGreenDeploymentsStack extends Stack {
  constructor(scope: Construct, id: string, reg: EnvironmentConfig, props?: StackProps) {
    super(scope, id, props);

    const prefix = `${reg.pattern}-simflexcloud-${reg.stage}-ecs-blue-green-deployments`;

    const ec2Role = new Role(this, `${prefix}-ec2-role`, {
      roleName: `${prefix}-ec2`,
      assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEC2ContainerServiceforEC2Role'),
        ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });

    const ecsRole = new Role(this, `${prefix}-ecs-role`, {
      roleName: `${prefix}-ecs-task`,
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')],
    });

    const vpc = new Vpc(this, `${prefix}-vpc`, {
      vpcName: prefix,
      natGateways: 1,
      maxAzs: 2,
    });

    const ec2Sg = new SecurityGroup(this, `${prefix}-ec2-sg`, {
      securityGroupName: `${prefix}-ec2`,
      vpc: vpc,
    });

    const albSg = new SecurityGroup(this, `${prefix}-alb-sg`, {
      securityGroupName: `${prefix}-alb`,
      vpc: vpc,
    });

    ec2Sg.addIngressRule(Peer.securityGroupId(albSg.securityGroupId), Port.allTraffic(), 'Allow all traffic from the same security group');

    const asg = new AutoScalingGroup(this, `${prefix}-asg`, {
      autoScalingGroupName: prefix,
      minCapacity: 1,
      maxCapacity: 1,
      vpc: vpc,
      securityGroup: ec2Sg,
      role: ec2Role,
      instanceType: InstanceType.of(InstanceClass.T3A, InstanceSize.MEDIUM),
      machineImage: EcsOptimizedImage.amazonLinux2(),
    });

    const alb = new ApplicationLoadBalancer(this, `${prefix}-alb`, {
      loadBalancerName: 'ecs-blue-green-deployments',
      vpc: vpc,
      securityGroup: albSg,
      internetFacing: true,
    });

    const ecs = new Cluster(this, `${prefix}-cluster`, {
      clusterName: prefix,
      vpc: vpc,
    });

    const asgProvider = new AsgCapacityProvider(this, `${prefix}-asg-capacity-provider`, {
      autoScalingGroup: asg,
      capacityProviderName: `${prefix}-asg-capacity-provider`,
      enableManagedScaling: false,
      enableManagedTerminationProtection: false,
    });

    ecs.addAsgCapacityProvider(asgProvider);

    const ecr = Repository.fromRepositoryName(this, `${prefix}-ecr`, `${PROJECT_NAME}/ecs-blue-green-deployments`);

    /**
     * Create two task definitions, one for your blue application and one for your green application.
     */
    const taskDefinitionBlue = new TaskDefinition(this, `${prefix}-task-definition-blue`, {
      compatibility: Compatibility.EC2,
      executionRole: ecsRole,
      cpu: '128',
      memoryMiB: '256',
    });
    taskDefinitionBlue.addContainer(`${prefix}-blue-container`, {
      image: ContainerImage.fromEcrRepository(ecr, 'testblue'),
      portMappings: [
        { containerPort: 8081, hostPort: 0, protocol: Protocol.TCP, name: 'ecs-blue-container-8081-tcp', appProtocol: AppProtocol.http },
      ],
      memoryLimitMiB: 256,
    });

    const taskDefinitionGreen = new TaskDefinition(this, `${prefix}-task-definition-green`, {
      compatibility: Compatibility.EC2,
      executionRole: ecsRole,
      cpu: '128',
      memoryMiB: '256',
    });
    taskDefinitionGreen.addContainer(`${prefix}-green-container`, {
      image: ContainerImage.fromEcrRepository(ecr, 'testgreen'),
      portMappings: [
        { containerPort: 8081, hostPort: 0, name: 'ecs-green-container-8081-tcp', appProtocol: AppProtocol.http },
      ],
      memoryLimitMiB: 256,
    });

    /**
     * Create two services, one for your blue application and one for the green application.
     */
    const greenService = new Ec2Service(this, `${prefix}-ec2-green-service`, {
      serviceName: `${prefix}-svc-green`,
      taskDefinition: taskDefinitionGreen,
      desiredCount: 2,
      cluster: ecs,
    });

    const blueService = new Ec2Service(this, `${prefix}-ec2-blue-service`, {
      serviceName: `${prefix}-svc-blue`,
      taskDefinition: taskDefinitionBlue,
      desiredCount: 0,
      cluster: ecs,
    });

    const listener80 = alb.addListener(`${prefix}-listener-80`, { port: 80, open: true });
    listener80.addTargets(`${prefix}-target-80`, {
      protocol: ApplicationProtocol.HTTP,
      healthCheck: { path: '/api/' },
      targets: [greenService, blueService],
    });
  }
}