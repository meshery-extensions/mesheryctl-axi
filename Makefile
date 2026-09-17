# Copyright Meshery Authors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Node/TypeScript targets for the mesheryctl-axi npm package, modelled on
# layer5io/sistent's Makefile. `make` with no target lists the targets below.
include build/Makefile.show-help.mk

.PHONY: setup build tests dev

## Install mesheryctl-axi dependencies via npm ci
setup:
	npm ci

## Build mesheryctl-axi with tsc into dist/
build:
	npm run build

## Run the vitest suite
tests:
	npm run test

## Run the CLI from source, e.g. make dev ARGS="connection list"
dev:
	npm run dev -- $(ARGS)
