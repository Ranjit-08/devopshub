-- ============================================================
-- DevOpsHub - Complete Database Schema
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE difficulty_level AS ENUM ('beginner', 'intermediate', 'advanced');
CREATE TYPE content_status AS ENUM ('active', 'inactive', 'archived');
CREATE TYPE test_status AS ENUM ('registered', 'in_progress', 'completed', 'disqualified', 'abandoned');
CREATE TYPE challenge_status AS ENUM ('pending', 'completed', 'failed');
CREATE TYPE notification_type AS ENUM ('login', 'test_registered', 'test_result', 'certificate', 'reminder', 'challenge');

-- ============================================================
-- USERS (extends Supabase auth.users)
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT,
  email TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  skill_score INTEGER DEFAULT 0,
  total_tests_taken INTEGER DEFAULT 0,
  total_lessons_completed INTEGER DEFAULT 0,
  streak_days INTEGER DEFAULT 0,
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  last_learning_at TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,
  telegram_chat_id TEXT,
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CLOUD PROVIDERS
-- ============================================================
CREATE TABLE public.cloud_providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  icon_url TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.cloud_providers (name, slug, description, sort_order) VALUES
  ('AWS', 'aws', 'Amazon Web Services - Leading cloud platform', 1),
  ('GCP', 'gcp', 'Google Cloud Platform', 2),
  ('Azure', 'azure', 'Microsoft Azure Cloud', 3),
  ('DevOps Tools', 'devops', 'DevOps and Infrastructure Tools', 4);

-- ============================================================
-- CATEGORIES
-- ============================================================
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID REFERENCES public.cloud_providers(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  icon TEXT,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider_id, slug)
);

-- AWS Categories
INSERT INTO public.categories (provider_id, name, slug, icon, sort_order)
SELECT p.id, cat.name, cat.slug, cat.icon, cat.sort_order
FROM public.cloud_providers p,
(VALUES
  ('Compute', 'compute', '⚡', 1),
  ('Storage', 'storage', '💾', 2),
  ('Databases', 'databases', '🗄️', 3),
  ('Networking', 'networking', '🌐', 4),
  ('Security', 'security', '🔒', 5),
  ('Monitoring', 'monitoring', '📊', 6),
  ('DevOps & CI/CD', 'devops-cicd', '🔄', 7),
  ('Analytics', 'analytics', '📈', 8),
  ('Machine Learning', 'ml', '🤖', 9),
  ('Serverless', 'serverless', '⚡', 10),
  ('Integration', 'integration', '🔗', 11),
  ('Containers', 'containers', '📦', 12)
) AS cat(name, slug, icon, sort_order)
WHERE p.slug = 'aws';

-- DevOps Categories
INSERT INTO public.categories (provider_id, name, slug, icon, sort_order)
SELECT p.id, cat.name, cat.slug, cat.icon, cat.sort_order
FROM public.cloud_providers p,
(VALUES
  ('Containers', 'containers', '📦', 1),
  ('Orchestration', 'orchestration', '🎯', 2),
  ('IaC', 'iac', '🏗️', 3),
  ('Configuration Mgmt', 'config-mgmt', '⚙️', 4),
  ('CI/CD', 'cicd', '🔄', 5),
  ('Monitoring', 'monitoring', '📊', 6),
  ('Service Mesh', 'service-mesh', '🕸️', 7),
  ('Security', 'security', '🔒', 8),
  ('Web Servers', 'web-servers', '🌐', 9),
  ('Version Control', 'vcs', '📝', 10)
) AS cat(name, slug, icon, sort_order)
WHERE p.slug = 'devops';

-- ============================================================
-- TOPICS (AWS Services & DevOps Tools)
-- ============================================================
CREATE TABLE public.topics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID REFERENCES public.categories(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  full_name TEXT,
  description TEXT,
  icon TEXT,
  tags TEXT[],
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AWS Compute
INSERT INTO public.topics (category_id, name, slug, full_name, description) 
SELECT c.id, t.name, t.slug, t.full_name, t.desc
FROM public.categories c,
(VALUES
  ('EC2', 'aws-ec2', 'Amazon EC2', 'Elastic Compute Cloud - Virtual servers in the cloud'),
  ('Lambda', 'aws-lambda', 'AWS Lambda', 'Serverless compute service'),
  ('ECS', 'aws-ecs', 'Amazon ECS', 'Elastic Container Service'),
  ('EKS', 'aws-eks', 'Amazon EKS', 'Elastic Kubernetes Service'),
  ('Fargate', 'aws-fargate', 'AWS Fargate', 'Serverless container compute'),
  ('Elastic Beanstalk', 'aws-beanstalk', 'AWS Elastic Beanstalk', 'PaaS for web applications'),
  ('Auto Scaling', 'aws-autoscaling', 'AWS Auto Scaling', 'Automatic capacity management'),
  ('Batch', 'aws-batch', 'AWS Batch', 'Fully managed batch computing')
) AS t(name, slug, full_name, desc)
WHERE c.slug = 'compute' AND c.provider_id = (SELECT id FROM public.cloud_providers WHERE slug = 'aws');

-- AWS Storage
INSERT INTO public.topics (category_id, name, slug, full_name, description)
SELECT c.id, t.name, t.slug, t.full_name, t.desc
FROM public.categories c,
(VALUES
  ('S3', 'aws-s3', 'Amazon S3', 'Simple Storage Service - Object storage'),
  ('EFS', 'aws-efs', 'Amazon EFS', 'Elastic File System'),
  ('FSx', 'aws-fsx', 'Amazon FSx', 'Fully managed file systems'),
  ('S3 Glacier', 'aws-glacier', 'Amazon S3 Glacier', 'Long-term archival storage'),
  ('Storage Gateway', 'aws-storage-gateway', 'AWS Storage Gateway', 'Hybrid cloud storage'),
  ('EBS', 'aws-ebs', 'Amazon EBS', 'Elastic Block Store')
) AS t(name, slug, full_name, desc)
WHERE c.slug = 'storage' AND c.provider_id = (SELECT id FROM public.cloud_providers WHERE slug = 'aws');

-- AWS Databases
INSERT INTO public.topics (category_id, name, slug, full_name, description)
SELECT c.id, t.name, t.slug, t.full_name, t.desc
FROM public.categories c,
(VALUES
  ('RDS', 'aws-rds', 'Amazon RDS', 'Relational Database Service'),
  ('Aurora', 'aws-aurora', 'Amazon Aurora', 'High-performance managed relational database'),
  ('DynamoDB', 'aws-dynamodb', 'Amazon DynamoDB', 'NoSQL key-value database'),
  ('ElastiCache', 'aws-elasticache', 'Amazon ElastiCache', 'In-memory caching service'),
  ('Neptune', 'aws-neptune', 'Amazon Neptune', 'Graph database service'),
  ('DocumentDB', 'aws-documentdb', 'Amazon DocumentDB', 'MongoDB-compatible document database'),
  ('Redshift', 'aws-redshift', 'Amazon Redshift', 'Data warehousing service'),
  ('Keyspaces', 'aws-keyspaces', 'Amazon Keyspaces', 'Apache Cassandra-compatible database')
) AS t(name, slug, full_name, desc)
WHERE c.slug = 'databases' AND c.provider_id = (SELECT id FROM public.cloud_providers WHERE slug = 'aws');

-- AWS Networking
INSERT INTO public.topics (category_id, name, slug, full_name, description)
SELECT c.id, t.name, t.slug, t.full_name, t.desc
FROM public.categories c,
(VALUES
  ('VPC', 'aws-vpc', 'Amazon VPC', 'Virtual Private Cloud'),
  ('Route53', 'aws-route53', 'Amazon Route 53', 'DNS and traffic management'),
  ('CloudFront', 'aws-cloudfront', 'Amazon CloudFront', 'Global CDN service'),
  ('ELB', 'aws-elb', 'Elastic Load Balancing', 'Distribute incoming traffic'),
  ('API Gateway', 'aws-api-gateway', 'Amazon API Gateway', 'Managed API service'),
  ('Direct Connect', 'aws-direct-connect', 'AWS Direct Connect', 'Dedicated network connection'),
  ('Transit Gateway', 'aws-transit-gateway', 'AWS Transit Gateway', 'Network transit hub'),
  ('Global Accelerator', 'aws-global-accelerator', 'AWS Global Accelerator', 'Improve global app availability')
) AS t(name, slug, full_name, desc)
WHERE c.slug = 'networking' AND c.provider_id = (SELECT id FROM public.cloud_providers WHERE slug = 'aws');

-- AWS Security
INSERT INTO public.topics (category_id, name, slug, full_name, description)
SELECT c.id, t.name, t.slug, t.full_name, t.desc
FROM public.categories c,
(VALUES
  ('IAM', 'aws-iam', 'AWS IAM', 'Identity and Access Management'),
  ('KMS', 'aws-kms', 'AWS KMS', 'Key Management Service'),
  ('Secrets Manager', 'aws-secrets-manager', 'AWS Secrets Manager', 'Manage secrets and credentials'),
  ('WAF', 'aws-waf', 'AWS WAF', 'Web Application Firewall'),
  ('Shield', 'aws-shield', 'AWS Shield', 'DDoS protection service'),
  ('GuardDuty', 'aws-guardduty', 'Amazon GuardDuty', 'Threat detection service'),
  ('Security Hub', 'aws-security-hub', 'AWS Security Hub', 'Unified security view'),
  ('Certificate Manager', 'aws-acm', 'AWS Certificate Manager', 'SSL/TLS certificates')
) AS t(name, slug, full_name, desc)
WHERE c.slug = 'security' AND c.provider_id = (SELECT id FROM public.cloud_providers WHERE slug = 'aws');

-- AWS Monitoring
INSERT INTO public.topics (category_id, name, slug, full_name, description)
SELECT c.id, t.name, t.slug, t.full_name, t.desc
FROM public.categories c,
(VALUES
  ('CloudWatch', 'aws-cloudwatch', 'Amazon CloudWatch', 'Monitoring and observability'),
  ('CloudTrail', 'aws-cloudtrail', 'AWS CloudTrail', 'Audit and governance logging'),
  ('X-Ray', 'aws-xray', 'AWS X-Ray', 'Distributed tracing service'),
  ('Config', 'aws-config', 'AWS Config', 'Resource configuration tracking'),
  ('Systems Manager', 'aws-ssm', 'AWS Systems Manager', 'Operational management')
) AS t(name, slug, full_name, desc)
WHERE c.slug = 'monitoring' AND c.provider_id = (SELECT id FROM public.cloud_providers WHERE slug = 'aws');

-- AWS DevOps/CI-CD
INSERT INTO public.topics (category_id, name, slug, full_name, description)
SELECT c.id, t.name, t.slug, t.full_name, t.desc
FROM public.categories c,
(VALUES
  ('CodePipeline', 'aws-codepipeline', 'AWS CodePipeline', 'Continuous delivery pipeline'),
  ('CodeBuild', 'aws-codebuild', 'AWS CodeBuild', 'Managed build service'),
  ('CodeDeploy', 'aws-codedeploy', 'AWS CodeDeploy', 'Automated deployment service'),
  ('CodeCommit', 'aws-codecommit', 'AWS CodeCommit', 'Git source control'),
  ('CodeArtifact', 'aws-codeartifact', 'AWS CodeArtifact', 'Artifact management'),
  ('CDK', 'aws-cdk', 'AWS CDK', 'Cloud Development Kit'),
  ('CloudFormation', 'aws-cloudformation', 'AWS CloudFormation', 'Infrastructure as Code')
) AS t(name, slug, full_name, desc)
WHERE c.slug = 'devops-cicd' AND c.provider_id = (SELECT id FROM public.cloud_providers WHERE slug = 'aws');

-- AWS Serverless
INSERT INTO public.topics (category_id, name, slug, full_name, description)
SELECT c.id, t.name, t.slug, t.full_name, t.desc
FROM public.categories c,
(VALUES
  ('Step Functions', 'aws-step-functions', 'AWS Step Functions', 'Serverless workflow orchestration'),
  ('EventBridge', 'aws-eventbridge', 'Amazon EventBridge', 'Serverless event bus'),
  ('SNS', 'aws-sns', 'Amazon SNS', 'Simple Notification Service'),
  ('SQS', 'aws-sqs', 'Amazon SQS', 'Simple Queue Service'),
  ('AppSync', 'aws-appsync', 'AWS AppSync', 'Managed GraphQL service')
) AS t(name, slug, full_name, desc)
WHERE c.slug = 'serverless' AND c.provider_id = (SELECT id FROM public.cloud_providers WHERE slug = 'aws');

-- AWS Analytics
INSERT INTO public.topics (category_id, name, slug, full_name, description)
SELECT c.id, t.name, t.slug, t.full_name, t.desc
FROM public.categories c,
(VALUES
  ('Athena', 'aws-athena', 'Amazon Athena', 'Interactive query service'),
  ('Glue', 'aws-glue', 'AWS Glue', 'ETL and data catalog service'),
  ('EMR', 'aws-emr', 'Amazon EMR', 'Big data processing'),
  ('Kinesis', 'aws-kinesis', 'Amazon Kinesis', 'Real-time data streaming'),
  ('OpenSearch', 'aws-opensearch', 'Amazon OpenSearch', 'Search and analytics engine'),
  ('QuickSight', 'aws-quicksight', 'Amazon QuickSight', 'Business intelligence service')
) AS t(name, slug, full_name, desc)
WHERE c.slug = 'analytics' AND c.provider_id = (SELECT id FROM public.cloud_providers WHERE slug = 'aws');

-- AWS ML
INSERT INTO public.topics (category_id, name, slug, full_name, description)
SELECT c.id, t.name, t.slug, t.full_name, t.desc
FROM public.categories c,
(VALUES
  ('SageMaker', 'aws-sagemaker', 'Amazon SageMaker', 'Machine learning platform'),
  ('Rekognition', 'aws-rekognition', 'Amazon Rekognition', 'Image and video analysis'),
  ('Bedrock', 'aws-bedrock', 'Amazon Bedrock', 'Foundation model service'),
  ('Comprehend', 'aws-comprehend', 'Amazon Comprehend', 'NLP service'),
  ('Textract', 'aws-textract', 'Amazon Textract', 'Document text extraction')
) AS t(name, slug, full_name, desc)
WHERE c.slug = 'ml' AND c.provider_id = (SELECT id FROM public.cloud_providers WHERE slug = 'aws');

-- DevOps Tools
INSERT INTO public.topics (category_id, name, slug, full_name, description)
SELECT c.id, t.name, t.slug, t.full_name, t.desc
FROM public.categories c,
(VALUES
  ('Docker', 'devops-docker', 'Docker', 'Container platform'),
  ('Kubernetes', 'devops-kubernetes', 'Kubernetes', 'Container orchestration'),
  ('Helm', 'devops-helm', 'Helm', 'Kubernetes package manager'),
  ('Terraform', 'devops-terraform', 'Terraform', 'Infrastructure as Code by HashiCorp'),
  ('Ansible', 'devops-ansible', 'Ansible', 'Configuration management'),
  ('Jenkins', 'devops-jenkins', 'Jenkins', 'Open source CI/CD server'),
  ('Git', 'devops-git', 'Git', 'Distributed version control'),
  ('GitHub Actions', 'devops-github-actions', 'GitHub Actions', 'CI/CD on GitHub'),
  ('GitLab CI/CD', 'devops-gitlab-cicd', 'GitLab CI/CD', 'Integrated CI/CD pipelines'),
  ('ArgoCD', 'devops-argocd', 'ArgoCD', 'GitOps continuous delivery'),
  ('Prometheus', 'devops-prometheus', 'Prometheus', 'Monitoring and alerting toolkit'),
  ('Grafana', 'devops-grafana', 'Grafana', 'Metrics visualization platform'),
  ('ELK Stack', 'devops-elk', 'ELK Stack', 'Elasticsearch, Logstash, Kibana'),
  ('HashiCorp Vault', 'devops-vault', 'HashiCorp Vault', 'Secrets management'),
  ('Consul', 'devops-consul', 'HashiCorp Consul', 'Service mesh and discovery'),
  ('Nginx', 'devops-nginx', 'Nginx', 'Web server and reverse proxy'),
  ('Apache', 'devops-apache', 'Apache HTTP Server', 'Web server'),
  ('Istio', 'devops-istio', 'Istio', 'Service mesh platform'),
  ('GitHub', 'devops-github', 'GitHub', 'Code hosting and collaboration')
) AS t(name, slug, full_name, desc)
WHERE c.provider_id = (SELECT id FROM public.cloud_providers WHERE slug = 'devops');

-- ============================================================
-- LEARNING CACHE
-- ============================================================
CREATE TABLE public.generated_learning_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_id UUID REFERENCES public.topics(id),
  difficulty difficulty_level NOT NULL,
  content JSONB NOT NULL,
  model_used TEXT,
  generation_time_ms INTEGER,
  hit_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  UNIQUE(topic_id, difficulty)
);

-- ============================================================
-- QUIZ CACHE
-- ============================================================
CREATE TABLE public.generated_quizzes_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_id UUID REFERENCES public.topics(id),
  difficulty difficulty_level NOT NULL,
  question_count INTEGER NOT NULL,
  questions JSONB NOT NULL,
  model_used TEXT,
  generation_time_ms INTEGER,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 day'
);

-- ============================================================
-- LAB CACHE
-- ============================================================
CREATE TABLE public.generated_labs_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_id UUID REFERENCES public.topics(id),
  difficulty difficulty_level NOT NULL,
  lab_content JSONB NOT NULL,
  model_used TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '3 days',
  UNIQUE(topic_id, difficulty)
);

-- ============================================================
-- PROGRESS TRACKING
-- ============================================================
CREATE TABLE public.learning_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES public.topics(id),
  difficulty difficulty_level NOT NULL,
  status TEXT DEFAULT 'started', -- started, completed
  time_spent_seconds INTEGER DEFAULT 0,
  last_position TEXT, -- section user was reading
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, topic_id, difficulty)
);

-- ============================================================
-- TEST REGISTRATIONS
-- ============================================================
CREATE TABLE public.test_registrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES public.topics(id),
  difficulty difficulty_level NOT NULL,
  question_count INTEGER NOT NULL DEFAULT 10,
  time_limit_minutes INTEGER NOT NULL DEFAULT 10,
  status test_status DEFAULT 'registered',
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  disqualified_at TIMESTAMPTZ,
  disqualification_reason TEXT,
  tab_switches INTEGER DEFAULT 0
);

-- ============================================================
-- QUIZ ATTEMPTS
-- ============================================================
CREATE TABLE public.quiz_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_id UUID REFERENCES public.test_registrations(id),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES public.topics(id),
  difficulty difficulty_level NOT NULL,
  questions JSONB NOT NULL, -- snapshot of questions asked
  answers JSONB, -- user's answers {question_index: selected_option}
  score INTEGER DEFAULT 0,
  total_questions INTEGER NOT NULL,
  correct_answers INTEGER DEFAULT 0,
  time_taken_seconds INTEGER,
  percentage DECIMAL(5,2),
  passed BOOLEAN DEFAULT false,
  result_email_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================================
-- CERTIFICATES
-- ============================================================
CREATE TABLE public.certificates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  attempt_id UUID REFERENCES public.quiz_attempts(id),
  topic_id UUID REFERENCES public.topics(id),
  certificate_number TEXT UNIQUE NOT NULL,
  score INTEGER NOT NULL,
  percentage DECIMAL(5,2) NOT NULL,
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  pdf_url TEXT
);

-- ============================================================
-- LEADERBOARD
-- ============================================================
CREATE TABLE public.leaderboard (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  skill_score INTEGER DEFAULT 0,
  tests_completed INTEGER DEFAULT 0,
  avg_score DECIMAL(5,2) DEFAULT 0,
  certificates_earned INTEGER DEFAULT 0,
  streak_days INTEGER DEFAULT 0,
  rank INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DAILY CHALLENGES
-- ============================================================
CREATE TABLE public.daily_challenges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL UNIQUE,
  topic_id UUID REFERENCES public.topics(id),
  difficulty difficulty_level NOT NULL,
  question JSONB NOT NULL, -- single MCQ question
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.daily_challenge_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  challenge_id UUID REFERENCES public.daily_challenges(id),
  selected_option INTEGER,
  is_correct BOOLEAN,
  attempted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, challenge_id)
);

-- ============================================================
-- NOTIFICATIONS LOG
-- ============================================================
CREATE TABLE public.notifications_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id),
  type notification_type NOT NULL,
  channel TEXT NOT NULL, -- email, telegram
  status TEXT DEFAULT 'pending', -- pending, sent, failed
  payload JSONB,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_profiles_skill_score ON public.profiles(skill_score DESC);
CREATE INDEX idx_profiles_last_active ON public.profiles(last_active_at);
CREATE INDEX idx_learning_progress_user ON public.learning_progress(user_id);
CREATE INDEX idx_learning_progress_topic ON public.learning_progress(topic_id);
CREATE INDEX idx_quiz_attempts_user ON public.quiz_attempts(user_id);
CREATE INDEX idx_quiz_attempts_topic ON public.quiz_attempts(topic_id);
CREATE INDEX idx_test_registrations_user ON public.test_registrations(user_id);
CREATE INDEX idx_leaderboard_score ON public.leaderboard(skill_score DESC);
CREATE INDEX idx_topics_category ON public.topics(category_id);
CREATE INDEX idx_categories_provider ON public.categories(provider_id);
CREATE INDEX idx_generated_learning_topic ON public.generated_learning_cache(topic_id, difficulty);
CREATE INDEX idx_generated_quiz_topic ON public.generated_quizzes_cache(topic_id, difficulty);
CREATE INDEX idx_daily_challenges_date ON public.daily_challenges(date DESC);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_challenge_attempts ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only see/edit their own
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Progress: own data only
CREATE POLICY "Own learning progress" ON public.learning_progress FOR ALL USING (auth.uid() = user_id);

-- Quiz attempts: own data only
CREATE POLICY "Own quiz attempts" ON public.quiz_attempts FOR ALL USING (auth.uid() = user_id);

-- Test registrations: own data only
CREATE POLICY "Own test registrations" ON public.test_registrations FOR ALL USING (auth.uid() = user_id);

-- Certificates: readable by all, writable by service
CREATE POLICY "Certificates public read" ON public.certificates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Own certificates" ON public.certificates FOR SELECT USING (auth.uid() = user_id);

-- Topics, Categories, Providers: public read
CREATE POLICY "Public read topics" ON public.topics FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "Public read categories" ON public.categories FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "Public read providers" ON public.cloud_providers FOR SELECT TO anon, authenticated USING (is_active = true);

-- Leaderboard: public read
CREATE POLICY "Leaderboard public read" ON public.leaderboard FOR SELECT TO authenticated USING (true);

-- Daily challenges: public read
CREATE POLICY "Daily challenges public read" ON public.daily_challenges FOR SELECT TO authenticated USING (true);
CREATE POLICY "Own challenge attempts" ON public.daily_challenge_attempts FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  );
  INSERT INTO public.leaderboard (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update skill score
CREATE OR REPLACE FUNCTION public.update_skill_score(p_user_id UUID, p_points INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.profiles SET skill_score = skill_score + p_points, updated_at = NOW() WHERE id = p_user_id;
  UPDATE public.leaderboard SET skill_score = skill_score + p_points, updated_at = NOW() WHERE user_id = p_user_id;
  -- Re-rank everyone
  WITH ranked AS (
    SELECT user_id, ROW_NUMBER() OVER (ORDER BY skill_score DESC) as new_rank
    FROM public.leaderboard
  )
  UPDATE public.leaderboard l SET rank = r.new_rank FROM ranked r WHERE l.user_id = r.user_id;
END;
$$;

-- Update leaderboard stats after test
CREATE OR REPLACE FUNCTION public.update_leaderboard_after_test()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
    UPDATE public.leaderboard
    SET
      tests_completed = tests_completed + 1,
      avg_score = (avg_score * tests_completed + NEW.percentage) / (tests_completed + 1),
      updated_at = NOW()
    WHERE user_id = NEW.user_id;

    UPDATE public.profiles
    SET total_tests_taken = total_tests_taken + 1, updated_at = NOW()
    WHERE id = NEW.user_id;

    -- Award skill points based on score
    PERFORM public.update_skill_score(NEW.user_id, FLOOR(NEW.percentage / 10)::INTEGER * 5);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_quiz_attempt_completed
  AFTER UPDATE ON public.quiz_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_leaderboard_after_test();