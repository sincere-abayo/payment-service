"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var CommandRegistry_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandRegistry = void 0;
const common_1 = require("@nestjs/common");
let CommandRegistry = CommandRegistry_1 = class CommandRegistry {
    logger = new common_1.Logger(CommandRegistry_1.name);
    commands = new Map();
    register(command) {
        if (this.commands.has(command.code)) {
            throw new Error(`Duplicate command registration: ${command.code}`);
        }
        this.commands.set(command.code, command);
        this.logger.log(`Registered command: ${command.code}`);
    }
    resolve(code) {
        const command = this.commands.get(code);
        if (!command) {
            throw new common_1.NotFoundException(`Unknown command: ${code}`);
        }
        return command;
    }
    getAll() {
        return Array.from(this.commands.values());
    }
};
exports.CommandRegistry = CommandRegistry;
exports.CommandRegistry = CommandRegistry = CommandRegistry_1 = __decorate([
    (0, common_1.Injectable)()
], CommandRegistry);
