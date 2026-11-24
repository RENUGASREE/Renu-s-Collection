import { Request, Response, NextFunction } from "express";
import * as adminService from "../services/admin.service.js";
import * as userService from "../services/user.service.js";
import * as paymentService from "../services/payment.service.js";
import { PostgresOrderRepository } from "../repositories/postgres-order.repository.js";

export async function getDashboard(_req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await adminService.getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
}

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await userService.listUsers(req.query as unknown as Parameters<typeof userService.listUsers>[0]);
    res.json({ success: true, data: result.items, meta: result.meta });
  } catch (error) {
    next(error);
  }
}

export async function updateUserRole(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await userService.updateUserRole(req.params.id, req.body.role);
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

export async function listOrdersRequiringAction(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const orderRepo = new PostgresOrderRepository();
    const orders = await orderRepo.findOrdersRequiringFulfillment(limit);
    res.json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    next(error);
  }
}

export async function retryOrderFulfillment(req: Request, res: Response, next: NextFunction) {
  try {
    const { orderId } = req.params;
    const result = await paymentService.retryOrderFulfillment(orderId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function reconcileAllFulfillments(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await paymentService.reconcilePendingOrderFulfillments();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
