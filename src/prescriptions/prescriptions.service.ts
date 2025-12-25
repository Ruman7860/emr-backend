import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, Prisma } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { UpdatePrescriptionDto } from './dto/update-prescription.dto';
import { PdfService } from '../common/services/pdf.service';
import { CloudinaryService } from '../common/services/cloudinary.service';
import { format } from 'date-fns';

@Injectable()
export class PrescriptionsService {
  constructor(
    private prisma: PrismaService,
    private pdfService: PdfService,
    private cloudinaryService: CloudinaryService,
  ) { }

  private async isAuthorizedInTenant(userId: string, tenantId: string, requiredRoles: Role[]): Promise<boolean> {
    const userTenant = await this.prisma.userTenant.findUnique({
      where: {
        userId_tenantId: { userId, tenantId },
      },
    });
    if (!userTenant) {
      return false;
    }
    return requiredRoles.includes(userTenant.role);
  }

  async create(createPrescriptionDto: CreatePrescriptionDto, user: { id: string; tenantId: string }) {
    const { visitId, patientId, medications } = createPrescriptionDto;

    // Check authorization (DOCTOR or ADMIN)
    if (!(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.DOCTOR, Role.ADMIN]))) {
      return {
        success: false,
        message: 'You are not authorized to create prescriptions in this tenant',
        statusCode: 403,
        data: null,
      };
    }

    // Check visit exists and is in tenant
    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
      include: { patient: true },
    });
    if (!visit || visit.patient.tenantId !== user.tenantId) {
      return {
        success: false,
        message: 'Visit not found or not in your tenant',
        statusCode: 404,
        data: null,
      };
    }

    // Check patient exists and is in tenant
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });
    if (!patient || patient.tenantId !== user.tenantId) {
      return {
        success: false,
        message: 'Patient not found or not in your tenant',
        statusCode: 404,
        data: null,
      };
    }

    // Validate medications array
    if (!medications || medications.length === 0) {
      return {
        success: false,
        message: 'At least one medication is required',
        statusCode: 400,
        data: null,
      };
    }

    try {
      // Transform medications to plain JSON array
      const medicationsJson: Prisma.InputJsonValue = medications.map(({ drugName, dosage, frequency, timing, duration, instructions }) => ({
        drugName,
        dosage,
        frequency,
        timing,
        duration,
        instructions,
      }));

      const prescription = await this.prisma.prescription.create({
        data: {
          visitId,
          patientId,
          medications: medicationsJson,
          deletedAt: null,
        },
      });

      return {
        success: true,
        message: 'Prescription created successfully',
        statusCode: 201,
        data: prescription,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create prescription',
        statusCode: 500,
        data: error.message,
      };
    }
  }

  async findAll(user: { id: string; tenantId: string }, patientId?: string, visitId?: string) {
    // Check authorization (DOCTOR, ADMIN, STAFF, NURSE)
    if (!(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.ADMIN, Role.DOCTOR, Role.STAFF, Role.NURSE]))) {
      return {
        success: false,
        message: 'You are not authorized to list prescriptions in this tenant',
        statusCode: 403,
        data: null,
      };
    }

    try {
      const where = visitId
        ? {
          visitId,
          deletedAt: null,
          visit: {
            deletedAt: null,
            patient: { tenantId: user.tenantId, deletedAt: null }
          }
        }
        : patientId
          ? {
            deletedAt: null,
            visit: {
              patientId,
              deletedAt: null,
              patient: { tenantId: user.tenantId, deletedAt: null }
            }
          }
          : {
            deletedAt: null,
            visit: {
              deletedAt: null,
              patient: { tenantId: user.tenantId, deletedAt: null }
            }
          };

      const prescriptions = await this.prisma.prescription.findMany({
        where,
        include: { visit: { include: { patient: true, doctor: true } }, patient: true },
        orderBy: { createdAt: 'desc' },
      });

      return {
        success: true,
        message: 'Prescriptions retrieved successfully',
        statusCode: 200,
        data: prescriptions,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to retrieve prescriptions',
        statusCode: 500,
        data: error.message,
      };
    }
  }

  async findOne(id: string, user: { id: string; tenantId: string }) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
      include: { visit: { include: { patient: true, doctor: true } }, patient: true },
    });

    if (!prescription || prescription.deletedAt) {
      return {
        success: false,
        message: 'Prescription not found or deleted',
        statusCode: 404,
        data: null,
      };
    }

    if (prescription.visit.patient.tenantId !== user.tenantId || !(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.ADMIN, Role.DOCTOR, Role.STAFF, Role.NURSE]))) {
      return {
        success: false,
        message: 'You are not authorized to view this prescription',
        statusCode: 403,
        data: null,
      };
    }

    return {
      success: true,
      message: 'Prescription retrieved successfully',
      statusCode: 200,
      data: prescription,
    };
  }

  async update(id: string, updatePrescriptionDto: UpdatePrescriptionDto, user: { id: string; tenantId: string }) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
      include: { visit: { include: { patient: true } } },
    });

    if (!prescription || prescription.deletedAt) {
      return {
        success: false,
        message: 'Prescription not found or deleted',
        statusCode: 404,
        data: null,
      };
    }

    if (prescription.visit.patient.tenantId !== user.tenantId || !(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.ADMIN, Role.DOCTOR]))) {
      return {
        success: false,
        message: 'You are not authorized to update this prescription',
        statusCode: 403,
        data: null,
      };
    }

    // Validate medications array if provided
    if (updatePrescriptionDto.medications && updatePrescriptionDto.medications.length === 0) {
      return {
        success: false,
        message: 'Medications array cannot be empty',
        statusCode: 400,
        data: null,
      };
    }

    try {
      // Transform medications to plain JSON array if provided
      const data: Prisma.PrescriptionUpdateInput = {};
      if (updatePrescriptionDto.medications) {
        data.medications = updatePrescriptionDto.medications.map(({ drugName, dosage, frequency, timing, duration, instructions }) => ({
          drugName,
          dosage,
          frequency,
          timing,
          duration,
          instructions,
        }));
      }

      const updatedPrescription = await this.prisma.prescription.update({
        where: { id },
        data,
      });

      return {
        success: true,
        message: 'Prescription updated successfully',
        statusCode: 200,
        data: updatedPrescription,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update prescription',
        statusCode: 500,
        data: error.message,
      };
    }
  }

  async remove(id: string, user: { id: string; tenantId: string }) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
      include: { visit: { include: { patient: true } } },
    });

    if (!prescription || prescription.deletedAt) {
      return {
        success: false,
        message: 'Prescription not found or already deleted',
        statusCode: 404,
        data: null,
      };
    }

    if (prescription.visit.patient.tenantId !== user.tenantId || !(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.ADMIN]))) {
      return {
        success: false,
        message: 'You must be an admin in this tenant to delete prescriptions',
        statusCode: 403,
        data: null,
      };
    }

    try {
      const deletedPrescription = await this.prisma.prescription.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      return {
        success: true,
        message: 'Prescription deleted successfully',
        statusCode: 200,
        data: deletedPrescription,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete prescription',
        statusCode: 500,
        data: error.message,
      };
    }
  }

  async generatePrescriptionPDF(visitId: string, user: { id: string; tenantId: string }, version: number = 1) {
    // Check authorization
    if (!(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.DOCTOR, Role.ADMIN]))) {
      return {
        success: false,
        message: 'You are not authorized to generate prescription PDFs',
        statusCode: 403,
        data: null,
      };
    }

    try {
      // Fetch prescription with all related data
      const prescription = await this.prisma.prescription.findFirst({
        where: {
          visitId,
          deletedAt: null,
        },
        include: {
          visit: {
            include: {
              patient: {
                include: {
                  LabTest: true,
                },
              },
              doctor: {
                include: {
                  user: true,
                },
              },
              labTests: true
            },
          },
          patient: {
            include: {
              LabTest: true,
            },
          },
        },
      });

      if (!prescription) {
        return {
          success: false,
          message: 'Prescription not found for this visit',
          statusCode: 404,
          data: null,
        };
      }

      // Verify tenant access
      if (prescription.visit.patient.tenantId !== user.tenantId) {
        return {
          success: false,
          message: 'Unauthorized access to prescription',
          statusCode: 403,
          data: null,
        };
      }

      const visitDateMap = {
        [prescription.visit.id]: format(
          new Date(prescription.visit.visitDate),
          'dd MMM yyyy'
        ),
      };
      const currentVisitId = prescription.visitId;
      const labTestDetails = Object.values(
        (prescription.patient?.LabTest || []).reduce((acc, test) => {
          if (!test.visitId || test.deletedAt) return acc;

          if (!acc[test.visitId]) {
            acc[test.visitId] = {
              visitId: test.visitId,
              visitDate:
                visitDateMap[test.visitId] || 'Previous Visit',
              isCurrent: test.visitId === currentVisitId,
              tests: [],
            };
          }

          acc[test.visitId].tests.push({
            testName: test.tests,
          });

          return acc;
        }, {} as Record<string, any>)
      );


      // Prepare data for PDF
      const pdfData = {
        clinicNameHindi: 'दिलशेर हेल्थ केयर',
        clinicNameEnglish: 'Dilsher Health Care',
        clinicSubtitle: '(LAL SAHEB)',
        clinicPhone: '+9472615965 | 7717783520',
        clinicAddress: 'क्लिनिक :- बेलबनवा टाउन हॉल, इमानुएल स्कूल के सामने, मोतिहारी',

        // Clinic Timing
        timingTitle: 'मिलने का समय',
        morningTiming: 'सुबह 9:00 बजे से 1:00 बजे तक',
        eveningTiming: 'शाम 3:00 बजे से 9:00 बजे तक',

        // default doctors
        doctors: [
          {
            name: 'Dr. Shahid Iqbal',
            degree: 'M.B.B.S',
            specialty: 'Medical Officer\nGeneral Physician & Surgeon',
            regNo: '41872',
            type: "physician"
          },
          {
            name: 'Dr. Saquib Hasan',
            degree: 'M.B.B.S',
            specialty: 'Medical Officer\nGeneral Physician & Surgeon',
            regNo: '47324',
            type: "physician"
          },
          {
            name: 'Dr. Shahina Parveen',
            degree: 'B.D.S. (Patna)',
            specialty: 'दांत एवं मुंह रोग विशेषज्ञ',
            regNo: '5660',
            type: "dentist"
          }
        ],

        // current doctor details
        doctorName: prescription.visit.doctor?.user?.name || 'Dr. Unknown',
        doctorRegistration: prescription.visit.doctor?.employeeCode || 'N/A',

        // patient details
        patientName: prescription.patient.fullName,
        patientAge: prescription.patient.age,
        patientAddress: prescription.patient.address,
        patientGender: prescription.patient.gender,
        patientWeight: '56 kg', // need to add weight in patient model

        // visit details
        visitId: prescription.visitId,
        visitDate: format(new Date(prescription.visit.visitDate), 'dd MMM yyyy'),

        // medications details
        medications: prescription.medications as any[],

        // notes details
        notes: prescription.visit.notes || '',

        // labtest details
        labTestDetails,

        // footer details
        footerText: '21 दिन बाद पूरा फीस लगेगा'
      };

      // Generate PDF
      const pdfBuffer = await this.pdfService.generatePrescriptionPDF(pdfData);

      // Upload to Cloudinary
      const publicId = `prescriptions/patient_${prescription.patientId}/visit_${visitId}/prescription_v${version}`;
      const uploadResult = await this.cloudinaryService.uploadPDF(pdfBuffer, publicId);

      // Save document record
      const prescriptionDocument = await this.prisma.prescriptionDocument.create({
        data: {
          prescriptionId: prescription.id,
          patientId: prescription.patientId,
          visitId: prescription.visitId,
          doctorId: prescription.visit.doctorId,
          cloudinaryPublicId: uploadResult.public_id,
          fileUrl: uploadResult.secure_url,
          version,
        },
      });

      // Generate signed URL
      const signedUrl = this.cloudinaryService.getSignedUrl(uploadResult.public_id, 300);

      return {
        success: true,
        message: 'Prescription PDF generated successfully',
        statusCode: 201,
        data: {
          documentId: prescriptionDocument.id,
          downloadUrl: signedUrl,
          version,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to generate prescription PDF: ${error.message}`,
        statusCode: 500,
        data: error.message,
      };
    }
  }

  async getPrescriptionDownloadUrl(documentId: string, user: { id: string; tenantId: string }) {
    // Check authorization
    if (!(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.DOCTOR, Role.ADMIN, Role.STAFF, Role.NURSE]))) {
      return {
        success: false,
        message: 'You are not authorized to download prescription PDFs',
        statusCode: 403,
        data: null,
      };
    }

    try {
      const document = await this.prisma.prescriptionDocument.findUnique({
        where: { id: documentId },
        include: {
          patient: true,
        },
      });

      if (!document || document.deletedAt) {
        return {
          success: false,
          message: 'Prescription document not found',
          statusCode: 404,
          data: null,
        };
      }

      // Verify tenant access
      if (document.patient.tenantId !== user.tenantId) {
        return {
          success: false,
          message: 'Unauthorized access to prescription document',
          statusCode: 403,
          data: null,
        };
      }

      // Generate signed URL with 5-minute expiry
      const signedUrl = this.cloudinaryService.getSignedUrl(document.cloudinaryPublicId, 300);

      return {
        success: true,
        message: 'Download URL generated successfully',
        statusCode: 200,
        data: {
          downloadUrl: signedUrl,
          expiresIn: 300,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to generate download URL: ${error.message}`,
        statusCode: 500,
        data: error.message,
      };
    }
  }
}