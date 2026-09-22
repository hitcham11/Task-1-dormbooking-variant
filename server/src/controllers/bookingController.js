import Joi from 'joi';
import { Booking } from '../models/Booking.js';

const createSchema = Joi.object({
  roomNumber: Joi.string().required(),
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().required(),
  purpose: Joi.string().allow('', null).optional(),
  bookedBy: Joi.string().hex().length(24).allow(null).optional()
});

const updateSchema = Joi.object({
  roomNumber: Joi.string(),
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso(),
  purpose: Joi.string().allow('', null),
  bookedBy: Joi.string().hex().length(24).allow(null)
});

// Overlap condition: ExistingStart < NewEnd AND ExistingEnd > NewStart
async function hasConflict(roomNumber, startDate, endDate, excludeId = null) {
  const query = {
    roomNumber,
    startDate: { $lt: new Date(endDate) },
    endDate: { $gt: new Date(startDate) }
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const existing = await Booking.findOne(query);
  return !!existing;
}

// GET /api/bookings
export async function getAllBookings(req, res, next) {
  try {
    const bookings = await Booking.find()
      .populate('bookedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ bookings });
  } catch (err) { next(err); }
}

// GET /api/bookings/:id
export async function getBooking(req, res, next) {
  try {
    const booking = await Booking.findById(req.params.id).populate('bookedBy', 'name email');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json({ booking });
  } catch (err) { next(err); }
}

// POST /api/bookings
export async function createBooking(req, res, next) {
  try {
    const { value, error } = createSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    const start = new Date(value.startDate);
    const end = new Date(value.endDate);

    if (start >= end) {
      return res.status(400).json({ message: 'startDate must be strictly before endDate' });
    }

    const conflict = await hasConflict(value.roomNumber, start, end);
    if (conflict) {
      return res.status(409).json({ message: 'Room is already booked for the selected time range' });
    }

    const booking = await Booking.create(value);
    res.status(201).json({ booking });
  } catch (err) { next(err); }
}

// PATCH /api/bookings/:id
export async function updateBooking(req, res, next) {
  try {
    const { value, error } = updateSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ message: error.message });

    const existing = await Booking.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Booking not found' });

    const roomNumber = value.roomNumber ?? existing.roomNumber;
    const startDate = value.startDate ? new Date(value.startDate) : existing.startDate;
    const endDate = value.endDate ? new Date(value.endDate) : existing.endDate;

    if (startDate >= endDate) {
      return res.status(400).json({ message: 'startDate must be strictly before endDate' });
    }

    const conflict = await hasConflict(roomNumber, startDate, endDate, req.params.id);
    if (conflict) {
      return res.status(409).json({ message: 'Room is already booked for the selected time range' });
    }

    const doc = await Booking.findByIdAndUpdate(
      req.params.id,
      { $set: value },
      { new: true, runValidators: true }
    ).populate('bookedBy', 'name email');

    res.json({ booking: doc });
  } catch (err) { next(err); }
}

// DELETE /api/bookings/:id
export async function deleteBooking(req, res, next) {
  try {
    const doc = await Booking.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Booking not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}