import { User } from './user.entity';
export declare enum EventType {
    USER_LOGIN = "user_login",
    USER_LOGOUT = "user_logout",
    USER_REGISTER = "user_register",
    LOT_CREATE = "lot_create",
    LOT_UPDATE = "lot_update",
    LOT_DELETE = "lot_delete",
    MESSAGE_SEND = "message_send",
    OPPORTUNITY_CREATE = "opportunity_create",
    ADMIN_ACTION = "admin_action"
}
export declare class Log {
    id: string;
    user: User;
    userId: string;
    eventType: EventType;
    detail: string;
    metadata: any;
    ipAddress: string;
    userAgent: string;
    createdAt: Date;
}
