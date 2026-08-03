pipeline {
    agent {
        label 'dai-run-ci'
    }

    options {
        disableConcurrentBuilds(abortPrevious: true)
        timestamps()
        timeout(time: 45, unit: 'MINUTES')
        skipDefaultCheckout(true)
    }

    triggers {
        githubPush()
    }

    environment {
        HARBOR_REGISTRY = 'harbor.dai-run.internal'
        HARBOR_PROJECT = 'dai-run'
        HARBOR_REPOSITORY = 'frontend'
        IMAGE_REPOSITORY = 'harbor.dai-run.internal/dai-run/frontend'
        GITOPS_REPOSITORY = 'git@github.com:dai-run/dai-run-gitops.git'
        GITOPS_BRANCH = 'main'
        GITOPS_GREEN_MANIFEST = 'environments/dev/deployment-green.yaml'
    }

    stages {
        stage('Checkout') {
            steps {
                script {
                    def checkoutState = checkout scm

                    env.SOURCE_BRANCH = checkoutState.GIT_BRANCH ?: ''
                    env.SOURCE_COMMIT = checkoutState.GIT_COMMIT ?: sh(
                        returnStdout: true,
                        script: 'git rev-parse HEAD'
                    ).trim()

                    if (!(env.SOURCE_COMMIT ==~ /^[0-9a-f]{40}$/)) {
                        error('Checkout returned an invalid Git commit SHA.')
                    }

                    env.SOURCE_COMMIT_SHORT = env.SOURCE_COMMIT.take(12)
                    env.TAGGED_IMAGE =
                        "${env.IMAGE_REPOSITORY}:${env.SOURCE_COMMIT}"
                    env.DEPLOY_FROM_MAIN =
                        (env.SOURCE_BRANCH == 'origin/main').toString()

                    if (env.DEPLOY_FROM_MAIN != 'true') {
                        echo(
                            "Quality-only build for ${env.SOURCE_BRANCH}; " +
                            'image build and deployment are restricted to main.'
                        )
                    }
                }
            }
        }

        stage('SonarQube Analysis') {
            steps {
                script {
                    def scannerHome = tool 'sonar-scanner'

                    withSonarQubeEnv('sonarqube') {
                        sh """
                            set -eu
                            "${scannerHome}/bin/sonar-scanner"
                        """
                    }
                }
            }
        }

        stage('Quality Gate') {
            steps {
                timeout(time: 10, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        stage('Build and Push Frontend') {
            when {
                expression {
                    env.DEPLOY_FROM_MAIN == 'true'
                }
            }
            steps {
                container('buildctl') {
                    withCredentials([
                        usernamePassword(
                            credentialsId: 'harbor-dai-run-robot',
                            usernameVariable: 'HARBOR_USERNAME',
                            passwordVariable: 'HARBOR_PASSWORD'
                        )
                    ]) {
                        sh '''#!/bin/sh
set -eu
set +x
umask 077

auth_dir="$(mktemp -d /tmp/dai-run-docker.XXXXXX)"
cleanup() {
    rm -rf -- "$auth_dir"
}
trap cleanup EXIT HUP INT TERM

export DOCKER_CONFIG="$auth_dir"
auth="$(printf '%s:%s' "$HARBOR_USERNAME" "$HARBOR_PASSWORD" \
    | base64 \
    | tr -d '\n')"

printf '{"auths":{"%s":{"auth":"%s"}}}\n' \
    "$HARBOR_REGISTRY" \
    "$auth" \
    >"$DOCKER_CONFIG/config.json"

chmod 600 "$DOCKER_CONFIG/config.json"
rm -f "$WORKSPACE/build-metadata.json"

buildctl \
    --addr "$BUILDKIT_HOST" \
    --tlscacert /etc/buildkit/client/ca.crt \
    --tlscert /etc/buildkit/client/client.crt \
    --tlskey /etc/buildkit/client/client.key \
    build \
    --progress=plain \
    --frontend dockerfile.v0 \
    --local "context=$WORKSPACE" \
    --local "dockerfile=$WORKSPACE" \
    --opt filename=Dockerfile.frontend \
    --opt platform=linux/amd64 \
    --output "type=image,name=$TAGGED_IMAGE,push=true" \
    --metadata-file "$WORKSPACE/build-metadata.json"
'''
                    }
                }
            }
        }

        stage('Verify Harbor Digest') {
            when {
                expression {
                    env.DEPLOY_FROM_MAIN == 'true'
                }
            }
            steps {
                script {
                    def metadata = readJSON file: 'build-metadata.json'
                    def digest =
                        metadata['containerimage.digest']?.toString()

                    if (!(digest ==~ /^sha256:[0-9a-f]{64}$/)) {
                        error('BuildKit returned an invalid image digest.')
                    }

                    env.IMAGE_DIGEST = digest
                    env.DIGEST_IMAGE =
                        "${env.IMAGE_REPOSITORY}@${env.IMAGE_DIGEST}"

                    def observedDigest = ''

                    container('crane') {
                        withCredentials([
                            usernamePassword(
                                credentialsId: 'harbor-dai-run-robot',
                                usernameVariable: 'HARBOR_USERNAME',
                                passwordVariable: 'HARBOR_PASSWORD'
                            )
                        ]) {
                            observedDigest = sh(
                                returnStdout: true,
                                script: '''#!/busybox/sh
set -eu
set +x
umask 077

auth_dir="$(mktemp -d /tmp/dai-run-crane.XXXXXX)"
cleanup() {
    rm -rf -- "$auth_dir"
}
trap cleanup EXIT HUP INT TERM

export DOCKER_CONFIG="$auth_dir"

printf '%s' "$HARBOR_PASSWORD" \
    | crane auth login "$HARBOR_REGISTRY" \
        -u "$HARBOR_USERNAME" \
        --password-stdin \
        >/dev/null

crane digest "$TAGGED_IMAGE"
'''
                            ).trim()
                        }
                    }

                    if (observedDigest != env.IMAGE_DIGEST) {
                        error(
                            "Harbor digest mismatch: BuildKit=" +
                            "${env.IMAGE_DIGEST}, Harbor=${observedDigest}"
                        )
                    }

                    currentBuild.description =
                        "${env.SOURCE_COMMIT_SHORT} " +
                        env.IMAGE_DIGEST.take(19)
                }
            }
        }

        stage('Harbor Trivy Gate') {
            when {
                expression {
                    env.DEPLOY_FROM_MAIN == 'true'
                }
            }
            steps {
                container('python') {
                    withCredentials([
                        usernamePassword(
                            credentialsId: 'harbor-dai-run-robot',
                            usernameVariable: 'HARBOR_USERNAME',
                            passwordVariable: 'HARBOR_PASSWORD'
                        )
                    ]) {
                        sh '''#!/bin/sh
set -eu
set +x

python3 scripts/wait-for-harbor-scan.py \
    --base-url "https://$HARBOR_REGISTRY" \
    --project "$HARBOR_PROJECT" \
    --repository "$HARBOR_REPOSITORY" \
    --reference "$SOURCE_COMMIT" \
    --expected-digest "$IMAGE_DIGEST" \
    --ca-file /internal-ca/ca.crt \
    --timeout-seconds 600 \
    --poll-seconds 10 \
    --max-critical 0
'''
                    }
                }
            }
        }

        stage('Update GitOps Green') {
            when {
                expression {
                    env.DEPLOY_FROM_MAIN == 'true'
                }
            }
            steps {
                withCredentials([
                    sshUserPrivateKey(
                        credentialsId: 'github-dai-run-gitops-write',
                        keyFileVariable: 'GITOPS_SSH_KEY'
                    )
                ]) {
                    sh '''#!/bin/sh
set -eu

export GIT_SSH_COMMAND="ssh -i $GITOPS_SSH_KEY \
    -o IdentitiesOnly=yes \
    -o StrictHostKeyChecking=yes \
    -o UserKnownHostsFile=/etc/dai-run/github_known_hosts"

test ! -e gitops-work || {
    echo 'gitops-work already exists; refusing to overwrite it.' >&2
    exit 1
}

git clone \
    --single-branch \
    --branch "$GITOPS_BRANCH" \
    "$GITOPS_REPOSITORY" \
    gitops-work

"$WORKSPACE/scripts/update-gitops-green-image.sh" \
    "$WORKSPACE/gitops-work" \
    "$DIGEST_IMAGE"

if git -C gitops-work diff --quiet -- "$GITOPS_GREEN_MANIFEST"; then
    echo "Green already references $IMAGE_DIGEST"
    exit 0
fi

git -C gitops-work config user.name 'DAI-RUN Jenkins'
git -C gitops-work config user.email 'jenkins@dai-run.internal'
git -C gitops-work add -- "$GITOPS_GREEN_MANIFEST"
git -C gitops-work diff --cached --check
git -C gitops-work commit \
    -m "deploy(dev): update green frontend to $SOURCE_COMMIT_SHORT"

git -C gitops-work fetch origin "$GITOPS_BRANCH"
git -C gitops-work rebase "origin/$GITOPS_BRANCH"
git -C gitops-work push origin "HEAD:$GITOPS_BRANCH"
'''
                }
            }
        }
    }

    post {
        always {
            deleteDir()
        }
    }
}
