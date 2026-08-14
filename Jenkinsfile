// Node.js MSA / Next.js / Python services that get their own Harbor image and
// their own dai-run-gitops blue/green Deployment, in addition to `frontend`
// (which keeps its own dedicated stages below and is not part of this list).
// `dockerfile` and `context` are both relative to the repo root ($WORKSPACE).
def SERVICES = [
    [id: 'auth-web', dockerfile: 'Dockerfile.auth-web', context: '.'],
    [id: 'auth-service', dockerfile: 'services-msa/auth-service/Dockerfile', context: 'services-msa/auth-service'],
    [id: 'challenge-service', dockerfile: 'services-msa/challenge-service/Dockerfile', context: 'services-msa/challenge-service'],
    [id: 'coaching-service', dockerfile: 'services-msa/coaching-service/Dockerfile', context: 'services-msa/coaching-service'],
    [id: 'course-recommendation-service', dockerfile: 'services-msa/course-recommendation-service/Dockerfile', context: 'services-msa/course-recommendation-service'],
    [id: 'course-service', dockerfile: 'services-msa/course-service/Dockerfile', context: 'services-msa/course-service'],
    [id: 'crew-service', dockerfile: 'services-msa/crew-service/Dockerfile', context: 'services-msa/crew-service'],
    [id: 'marathon-service', dockerfile: 'services-msa/marathon-service/Dockerfile', context: 'services-msa/marathon-service'],
    [id: 'media-service', dockerfile: 'services-msa/media-service/Dockerfile', context: 'services-msa/media-service'],
    [id: 'notification-service', dockerfile: 'services-msa/notification-service/Dockerfile', context: 'services-msa/notification-service'],
    [id: 'running-record-service', dockerfile: 'services-msa/running-record-service/Dockerfile', context: 'services-msa/running-record-service'],
    [id: 'shoe-service', dockerfile: 'services-msa/shoe-service/Dockerfile', context: 'services-msa/shoe-service'],
    [id: 'ai-assistant-service', dockerfile: 'services-msa/ai-assistant-service/Dockerfile', context: 'services-msa/ai-assistant-service'],
    // ignoreCves: python:3.12-slim (Debian) bundles perl-base as a base-OS
    // dependency; this service is pure Python and never invokes perl.
    // perl-base is Priority:required on Debian so purging it from the
    // image isn't safe to do blind -- excluding these 4 specific CVEs from
    // the gate instead of the whole critical-severity class. Revisit if
    // Debian ships a backport (apt-get upgrade already runs on every
    // build) or if this list needs to grow.
    [
        id: 'ai-rag-service',
        dockerfile: 'ai/ai-rag-service/Dockerfile',
        context: 'ai/ai-rag-service',
        ignoreCves: [
            'CVE-2026-13221',  // Perl regex engine, integer overflow
            'CVE-2026-8376',   // Perl regex engine, heap buffer overflow
            'CVE-2026-42496',  // Perl Archive::Tar, symlink extraction
            'CVE-2026-57433',  // Perl Storable, integer overflow
        ],
    ],
    // ai-course-recommendation / ai-shoe-life are temporarily excluded:
    // dai-run-gitops has no Deployment manifests for them yet (deferred for
    // cluster CPU headroom; add back once capacity allows). ai-rag-service
    // was in the same boat but worker1 has confirmed headroom (~2.2 cores
    // free against its 150m request) so it's back in.
]

// Maps a SERVICES `id` to the dai-run-gitops production Deployment
// manifest(s) it feeds (frontend's own prod target is handled via the
// GITOPS_PROD_* environment values below instead, since it isn't part of
// SERVICES). A service with no entry here has no production counterpart yet
// -- course-recommendation-service and ai-assistant-service are built and
// deployed to dev only, and are deliberately left out. Several prod
// Deployments were originally built and pushed by hand under their own
// `dir-*`-named Harbor repository, before this pipeline or dai-run-gitops
// managed them; `oldRepository` lets the first automated deploy migrate
// each one onto the same Harbor repository dev already uses (see
// update-gitops-prod-image.sh), after which it's simply ignored.
def PROD_TARGETS = [
    'auth-web': [
        [manifest: 'environments/prod/backend/deployment-dir-auth-web.yaml', oldRepository: 'dir-auth-web'],
    ],
    'auth-service': [
        [manifest: 'environments/prod/backend/deployment-dir-auth-user.yaml', oldRepository: 'dir-auth-user'],
    ],
    'challenge-service': [
        [manifest: 'environments/prod/backend/deployment-dir-challenge.yaml', oldRepository: 'dir-challenge'],
        [manifest: 'environments/prod/backend/deployment-dir-challenge-consumer.yaml', oldRepository: 'dir-challenge'],
    ],
    'coaching-service': [
        [manifest: 'environments/prod/backend/deployment-dir-coaching.yaml', oldRepository: 'dir-coaching'],
    ],
    'course-service': [
        [manifest: 'environments/prod/backend/deployment-dir-course.yaml', oldRepository: 'dir-course'],
    ],
    'crew-service': [
        [manifest: 'environments/prod/backend/deployment-dir-crew.yaml', oldRepository: 'dir-crew'],
        [manifest: 'environments/prod/backend/deployment-dir-crew-consumer.yaml', oldRepository: 'dir-crew'],
    ],
    'marathon-service': [
        [manifest: 'environments/prod/backend/deployment-dir-marathon.yaml', oldRepository: 'dir-marathon'],
    ],
    'media-service': [
        [manifest: 'environments/prod/backend/deployment-dir-media.yaml', oldRepository: 'dir-media'],
    ],
    'notification-service': [
        [manifest: 'environments/prod/backend/deployment-dir-notification.yaml', oldRepository: 'dir-notification'],
        [manifest: 'environments/prod/backend/deployment-dir-notification-consumer.yaml', oldRepository: 'dir-notification'],
    ],
    'running-record-service': [
        [manifest: 'environments/prod/backend/deployment-dir-running-record.yaml', oldRepository: 'dir-running-record'],
        [manifest: 'environments/prod/backend/deployment-dir-running-record-outbox-publisher.yaml', oldRepository: 'dir-running-record'],
    ],
    'shoe-service': [
        [manifest: 'environments/prod/backend/deployment-dir-shoe.yaml', oldRepository: 'dir-shoe'],
    ],
]

pipeline {
    agent {
        label 'dai-run-ci'
    }

    options {
        disableConcurrentBuilds()
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
        GITOPS_PROD_MANIFEST = 'environments/prod/frontend/deployment-dir-frontend.yaml'
        GITOPS_PROD_OLD_REPOSITORY = 'dir-frontend'
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

        stage('Start SonarQube') {
            agent {
                label 'built-in'
            }
            steps {
                sh '''#!/bin/sh
set -eu

sudo systemctl start sonarqube

i=0
while [ "$i" -lt 60 ]; do
    status="$(curl -sf http://localhost:9000/api/system/status \
        | grep -o '"status":"[^"]*"' || true)"
    case "$status" in
        *'"status":"UP"'*)
            exit 0
            ;;
    esac
    i=$((i + 1))
    sleep 5
done

echo 'SonarQube failed to become ready' >&2
sudo journalctl -u sonarqube --no-pager --lines=200
exit 1
'''
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

git -C gitops-work config user.name 'DAI-RUN Jenkins'
git -C gitops-work config user.email 'jenkins@dai-run.internal'

"$WORKSPACE/scripts/update-gitops-green-image.sh" \
    "$WORKSPACE/gitops-work" \
    "$DIGEST_IMAGE" \
    "$HARBOR_REPOSITORY" \
    "$GITOPS_GREEN_MANIFEST" \
    environments/dev/deployment.yaml

if git -C gitops-work diff --quiet -- "$GITOPS_GREEN_MANIFEST"; then
    echo "Green already references $IMAGE_DIGEST"
else
    git -C gitops-work add -- "$GITOPS_GREEN_MANIFEST"
    git -C gitops-work diff --cached --check
    git -C gitops-work commit \
        -m "deploy(dev): update green frontend to $SOURCE_COMMIT_SHORT"
fi

"$WORKSPACE/scripts/update-gitops-prod-image.sh" \
    "$WORKSPACE/gitops-work" \
    "$DIGEST_IMAGE" \
    "$HARBOR_REPOSITORY" \
    "$GITOPS_PROD_OLD_REPOSITORY" \
    "$GITOPS_PROD_MANIFEST"

if git -C gitops-work diff --quiet -- "$GITOPS_PROD_MANIFEST"; then
    echo "Prod already references $IMAGE_DIGEST"
else
    git -C gitops-work add -- "$GITOPS_PROD_MANIFEST"
    git -C gitops-work diff --cached --check
    git -C gitops-work commit \
        -m "deploy(prod): update frontend to $SOURCE_COMMIT_SHORT"
fi

if [ -z "$(git -C gitops-work log --oneline "origin/$GITOPS_BRANCH..HEAD" 2>/dev/null)" ]; then
    echo 'Nothing changed for frontend; nothing to push.'
    exit 0
fi

git -C gitops-work fetch origin "$GITOPS_BRANCH"
git -C gitops-work rebase "origin/$GITOPS_BRANCH"
git -C gitops-work push origin "HEAD:$GITOPS_BRANCH"
'''
                }
            }
        }

        // Builds, scans, and deploys the services in SERVICES the same way
        // the stages above handle frontend, but driven by a single loop
        // instead of one stage set per service. Each service gets its own
        // Harbor repository (harbor.dai-run.internal/dai-run/<id>) and its
        // own dai-run-gitops Green manifest
        // (environments/dev/deployment-<id>-green.yaml); frontend's own
        // manifest and commit history above are untouched. Services listed
        // in PROD_TARGETS additionally get their production Deployment
        // manifest(s) updated in the same clone/commit/push cycle.
        stage('Build, Scan, and Deploy Services') {
            when {
                expression {
                    env.DEPLOY_FROM_MAIN == 'true'
                }
            }
            steps {
                script {
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

test ! -e gitops-services-work || {
    echo 'gitops-services-work already exists; refusing to overwrite it.' >&2
    exit 1
}

git clone \
    --single-branch \
    --branch "$GITOPS_BRANCH" \
    "$GITOPS_REPOSITORY" \
    gitops-services-work

git -C gitops-services-work config user.name 'DAI-RUN Jenkins'
git -C gitops-services-work config user.email 'jenkins@dai-run.internal'
'''
                    }

                    for (svc in SERVICES) {
                        def dockerfileName = svc.dockerfile.substring(
                            svc.dockerfile.lastIndexOf('/') + 1
                        )
                        def repository = "dai-run/${svc.id}"
                        def taggedImage =
                            "${env.HARBOR_REGISTRY}/${repository}:${env.SOURCE_COMMIT}"
                        def greenManifest =
                            "environments/dev/deployment-${svc.id}-green.yaml"
                        def blueManifest =
                            "environments/dev/deployment-${svc.id}.yaml"

                        echo "== ${svc.id}: build and push =="
                        container('buildctl') {
                            withCredentials([
                                usernamePassword(
                                    credentialsId: 'harbor-dai-run-robot',
                                    usernameVariable: 'HARBOR_USERNAME',
                                    passwordVariable: 'HARBOR_PASSWORD'
                                )
                            ]) {
                                withEnv([
                                    "SERVICE_CONTEXT=${svc.context}",
                                    "SERVICE_DOCKERFILE=${dockerfileName}",
                                    "SERVICE_TAGGED_IMAGE=${taggedImage}",
                                    "SERVICE_METADATA_FILE=build-metadata-${svc.id}.json"
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
rm -f "$WORKSPACE/$SERVICE_METADATA_FILE"

buildctl \
    --addr "$BUILDKIT_HOST" \
    --tlscacert /etc/buildkit/client/ca.crt \
    --tlscert /etc/buildkit/client/client.crt \
    --tlskey /etc/buildkit/client/client.key \
    build \
    --progress=plain \
    --frontend dockerfile.v0 \
    --local "context=$WORKSPACE/$SERVICE_CONTEXT" \
    --local "dockerfile=$WORKSPACE/$SERVICE_CONTEXT" \
    --opt filename="$SERVICE_DOCKERFILE" \
    --opt platform=linux/amd64 \
    --output "type=image,name=$SERVICE_TAGGED_IMAGE,push=true" \
    --metadata-file "$WORKSPACE/$SERVICE_METADATA_FILE"
'''
                                }
                            }
                        }

                        echo "== ${svc.id}: verify Harbor digest =="
                        def metadata = readJSON(
                            file: "build-metadata-${svc.id}.json"
                        )
                        def digest =
                            metadata['containerimage.digest']?.toString()

                        if (!(digest ==~ /^sha256:[0-9a-f]{64}$/)) {
                            error(
                                "BuildKit returned an invalid image " +
                                "digest for ${svc.id}."
                            )
                        }

                        def digestImage =
                            "${env.HARBOR_REGISTRY}/${repository}@${digest}"
                        def observedDigest = ''

                        container('crane') {
                            withCredentials([
                                usernamePassword(
                                    credentialsId: 'harbor-dai-run-robot',
                                    usernameVariable: 'HARBOR_USERNAME',
                                    passwordVariable: 'HARBOR_PASSWORD'
                                )
                            ]) {
                                withEnv([
                                    "SERVICE_TAGGED_IMAGE=${taggedImage}"
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

crane digest "$SERVICE_TAGGED_IMAGE"
'''
                                    ).trim()
                                }
                            }
                        }

                        if (observedDigest != digest) {
                            error(
                                "Harbor digest mismatch for ${svc.id}: " +
                                "BuildKit=${digest}, Harbor=${observedDigest}"
                            )
                        }

                        echo "== ${svc.id}: Harbor Trivy gate =="
                        def ignoreCveArgs = (svc.ignoreCves ?: [])
                            .collect { "--ignore-cve ${it}" }
                            .join(' ')
                        container('python') {
                            withCredentials([
                                usernamePassword(
                                    credentialsId: 'harbor-dai-run-robot',
                                    usernameVariable: 'HARBOR_USERNAME',
                                    passwordVariable: 'HARBOR_PASSWORD'
                                )
                            ]) {
                                withEnv([
                                    "SERVICE_REPOSITORY=${svc.id}",
                                    "SERVICE_DIGEST=${digest}",
                                    "SERVICE_IGNORE_CVE_ARGS=${ignoreCveArgs}"
                                ]) {
                                    sh '''#!/bin/sh
set -eu
set +x

python3 scripts/wait-for-harbor-scan.py \
    --base-url "https://$HARBOR_REGISTRY" \
    --project "$HARBOR_PROJECT" \
    --repository "$SERVICE_REPOSITORY" \
    --reference "$SOURCE_COMMIT" \
    --expected-digest "$SERVICE_DIGEST" \
    --ca-file /internal-ca/ca.crt \
    --timeout-seconds 600 \
    --poll-seconds 10 \
    --max-critical 0 \
    ${SERVICE_IGNORE_CVE_ARGS:-}
'''
                                }
                            }
                        }

                        echo "== ${svc.id}: update GitOps Green =="
                        withEnv([
                            "SERVICE_ID=${svc.id}",
                            "SERVICE_DIGEST_IMAGE=${digestImage}",
                            "SERVICE_GREEN_MANIFEST=${greenManifest}",
                            "SERVICE_BLUE_MANIFEST=${blueManifest}"
                        ]) {
                            sh '''#!/bin/sh
set -eu

"$WORKSPACE/scripts/update-gitops-green-image.sh" \
    "$WORKSPACE/gitops-services-work" \
    "$SERVICE_DIGEST_IMAGE" \
    "$SERVICE_ID" \
    "$SERVICE_GREEN_MANIFEST" \
    "$SERVICE_BLUE_MANIFEST"

if git -C gitops-services-work diff --quiet -- "$SERVICE_GREEN_MANIFEST"; then
    echo "Green already references $SERVICE_DIGEST_IMAGE for $SERVICE_ID"
else
    git -C gitops-services-work add -- "$SERVICE_GREEN_MANIFEST"
    git -C gitops-services-work diff --cached --check
    git -C gitops-services-work commit \
        -m "deploy(dev): update green $SERVICE_ID to $SOURCE_COMMIT_SHORT"
fi
'''
                        }

                        def prodTargets = PROD_TARGETS[svc.id] ?: []

                        if (prodTargets.isEmpty()) {
                            echo "== ${svc.id}: no production target, skipping =="
                        }

                        for (target in prodTargets) {
                            echo "== ${svc.id}: update GitOps prod (${target.manifest}) =="
                            withEnv([
                                "SERVICE_ID=${svc.id}",
                                "SERVICE_DIGEST_IMAGE=${digestImage}",
                                "SERVICE_PROD_MANIFEST=${target.manifest}",
                                "SERVICE_PROD_OLD_REPOSITORY=${target.oldRepository}"
                            ]) {
                                sh '''#!/bin/sh
set -eu

"$WORKSPACE/scripts/update-gitops-prod-image.sh" \
    "$WORKSPACE/gitops-services-work" \
    "$SERVICE_DIGEST_IMAGE" \
    "$SERVICE_ID" \
    "$SERVICE_PROD_OLD_REPOSITORY" \
    "$SERVICE_PROD_MANIFEST"

if git -C gitops-services-work diff --quiet -- "$SERVICE_PROD_MANIFEST"; then
    echo "Prod already references $SERVICE_DIGEST_IMAGE for $SERVICE_ID ($SERVICE_PROD_MANIFEST)"
else
    git -C gitops-services-work add -- "$SERVICE_PROD_MANIFEST"
    git -C gitops-services-work diff --cached --check
    git -C gitops-services-work commit \
        -m "deploy(prod): update $SERVICE_ID ($SERVICE_PROD_MANIFEST) to $SOURCE_COMMIT_SHORT"
fi
'''
                            }
                        }
                    }

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

if [ -z "$(git -C gitops-services-work log --oneline "origin/$GITOPS_BRANCH..HEAD" 2>/dev/null)" ]; then
    echo 'No service Green or prod manifests changed; nothing to push.'
    exit 0
fi

git -C gitops-services-work fetch origin "$GITOPS_BRANCH"
git -C gitops-services-work rebase "origin/$GITOPS_BRANCH"
git -C gitops-services-work push origin "HEAD:$GITOPS_BRANCH"
'''
                    }
                }
            }
        }
    }

    post {
        always {
            deleteDir()
            node('built-in') {
                sh 'sudo systemctl stop sonarqube || true'
            }
        }
    }
}
