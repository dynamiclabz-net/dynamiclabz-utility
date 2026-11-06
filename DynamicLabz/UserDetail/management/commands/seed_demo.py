from datetime import datetime, timedelta, time

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from Attendance.models import Attendance
from Client.models import Client, Invoice
from Lead.models import Lead, Meeting
from Prospect.models import Prospect, CallLog, FollowUp
from Target.models import Target
from UserDetail.models import User
from Work.models import Project, Task

ADMIN_EMAIL = 'admin@dynamiclabz.com'
ADMIN_PASSWORD = 'Admin@123'
TEAM_PASSWORD = 'Dynamic@123'


class Command(BaseCommand):
    help = 'Creates the Dynamic Labz admin account and (optionally) realistic demo data.'

    def add_arguments(self, parser):
        parser.add_argument('--admin-only', action='store_true', help='Only create the admin account.')

    @transaction.atomic
    def handle(self, *args, **options):
        if User.objects.exists():
            self.stdout.write('Users already exist - skipping seed.')
            return

        admin = User.objects.create_superuser(
            email=ADMIN_EMAIL, password=ADMIN_PASSWORD, first_name='Divyam', last_name='Shah',
            designation='Founder', contact_number='+91 98250 00001',
        )
        self.stdout.write(f'Admin created: {ADMIN_EMAIL} / {ADMIN_PASSWORD}')
        if options['admin_only']:
            return

        now = timezone.now()
        today = timezone.localdate()

        def at(day_offset, hour, minute=0):
            day = today + timedelta(days=day_offset)
            return timezone.make_aware(datetime.combine(day, time(hour, minute)))

        riya = User.objects.create_user(
            'riya@dynamiclabz.com', TEAM_PASSWORD, first_name='Riya', last_name='Mehta', role='sales',
            designation='Business Development', contact_number='+91 98250 00002', date_of_joining=today - timedelta(days=300),
        )
        arjun = User.objects.create_user(
            'arjun@dynamiclabz.com', TEAM_PASSWORD, first_name='Arjun', last_name='Patel', role='sales',
            designation='Sales Executive', contact_number='+91 98250 00003', date_of_joining=today - timedelta(days=180),
        )
        karan = User.objects.create_user(
            'karan@dynamiclabz.com', TEAM_PASSWORD, first_name='Karan', last_name='Joshi', role='dev',
            designation='Full-stack Developer', contact_number='+91 98250 00004', date_of_joining=today - timedelta(days=400),
        )
        meera = User.objects.create_user(
            'meera@dynamiclabz.com', TEAM_PASSWORD, first_name='Meera', last_name='Nair', role='dev',
            designation='UI Engineer', contact_number='+91 98250 00005', date_of_joining=today - timedelta(days=220),
        )

        prospects_data = [
            (riya, 'Kaveri Textiles', 'Surat', 'kaveritextiles.in', 'Textiles', 'Hemant Kaveri', 'Owner', '+91 98240 11001', 'Needs an ERP for inventory and dispatch.', 'new'),
            (riya, 'Sahyadri Logistics', 'Pune', 'sahyadrilogistics.com', 'Logistics', 'Pooja Deshmukh', 'Ops Head', '+91 98220 11002', 'Fleet tracking dashboard and driver app.', 'follow_up'),
            (riya, 'Bluepeak Dental', 'Ahmedabad', None, 'Healthcare', 'Dr. Nilesh Shah', 'Founder', '+91 98790 11003', 'Appointment booking website with WhatsApp reminders.', 'interested'),
            (riya, 'Orchid Hospitality', 'Goa', 'orchidstays.in', 'Hospitality', 'Marcus Fernandes', 'GM', '+91 98230 11004', 'Direct booking engine to cut OTA commission.', 'contacted'),
            (arjun, 'Northwind Foods', 'Mumbai', 'northwindfoods.in', 'FMCG', 'Sneha Kulkarni', 'Marketing Lead', '+91 98190 11005', 'Distributor portal and order tracking.', 'follow_up'),
            (arjun, 'Vedanta Edu', 'Jaipur', 'vedantaedu.org', 'Education', 'Rahul Sharma', 'Director', '+91 98290 11006', 'Student LMS with fee collection.', 'not_interested'),
            (arjun, 'Pixel & Pine', 'Bengaluru', 'pixelandpine.design', 'Design Studio', 'Aditi Rao', 'Partner', '+91 98450 11007', 'Portfolio site with a project CMS.', 'interested'),
            (arjun, 'Greenfield Agro', 'Indore', None, 'Agriculture', 'Suresh Patidar', 'Owner', '+91 98260 11008', 'Mandi price app for farmers.', 'new'),
        ]
        prospects = []
        for owner, company, place, website, industry, person, designation, number, requirement, state in prospects_data:
            prospects.append(Prospect.objects.create(
                owner=owner, company_name=company, place=place, website=website, industry=industry,
                contact_person=person, designation=designation, contact_number=number, requirement=requirement,
                status=state, created_at=now - timedelta(days=12),
            ))

        def log(prospect, outcome, summary, days_ago, user=None, hour=11):
            call = CallLog.objects.create(
                prospect=prospect, called_by=user or prospect.owner, outcome=outcome, summary=summary,
                connected=outcome in CallLog.CONNECTED_OUTCOMES, called_at=at(-days_ago, hour),
                duration_minutes=6 if outcome in CallLog.CONNECTED_OUTCOMES else None,
            )
            if call.connected and not prospect.first_connected_at:
                prospect.first_connected_at = call.called_at
                prospect.save(update_fields=['first_connected_at'])
            return call

        kaveri, sahyadri, bluepeak, orchid, northwind, vedanta, pixel, greenfield = prospects

        log(sahyadri, 'no_answer', 'Rang twice, no pickup.', 6)
        log(sahyadri, 'connected_brief_given', 'Shared a short intro of our fleet-tracking work. Pooja is travelling this week.', 5)
        log(sahyadri, 'call_later', 'Asked to call back after Diwali shipments settle.', 1, hour=15)
        FollowUp.objects.create(prospect=sahyadri, assigned_to=riya, created_by=riya, due_at=at(0, 16), notes='Call Pooja about the tracking demo')

        log(bluepeak, 'connected_interested', 'Wants booking site live in 3 weeks. Asked for a price range.', 4)
        log(bluepeak, 'meeting_fixed', 'Fixed a meeting at the clinic.', 2)
        FollowUp.objects.create(prospect=bluepeak, assigned_to=riya, created_by=riya, due_at=at(1, 11), follow_type='meeting', notes='Clinic visit - bring demo')

        log(orchid, 'not_available', 'GM is in a property review. Try after 4 PM.', 3)
        FollowUp.objects.create(prospect=orchid, assigned_to=riya, created_by=riya, due_at=at(-2, 16), notes='Retry the GM')

        log(northwind, 'connected_brief_given', 'Sneha is evaluating two vendors. Will share the RFP.', 3, hour=12)
        FollowUp.objects.create(prospect=northwind, assigned_to=arjun, created_by=arjun, due_at=at(0, 12), follow_type='email', notes='Send case studies')
        log(vedanta, 'not_interested', 'Already signed with another vendor.', 8)
        log(pixel, 'connected_interested', 'Likes our portfolio. Wants a call with the design lead.', 2)
        FollowUp.objects.create(prospect=pixel, assigned_to=arjun, created_by=arjun, due_at=at(2, 10), notes='Intro call with Meera')

        hotel = Prospect.objects.create(
            owner=riya, company_name='Lakeview Resorts', place='Udaipur', website='lakeviewresorts.in', industry='Hospitality',
            contact_person='Anita Singh', designation='Director', contact_number='+91 98280 11009',
            requirement='Booking engine and channel manager integration.', status='converted', created_at=now - timedelta(days=40),
        )
        log(hotel, 'connected_interested', 'Great first call, wants a proposal.', 38)
        log(hotel, 'meeting_fixed', 'Meeting fixed at the resort.', 33)
        school = Prospect.objects.create(
            owner=arjun, company_name='Sunrise Public School', place='Vadodara', website='sunrisepublic.edu.in', industry='Education',
            contact_person='Mrs. Kavita Iyer', designation='Principal', contact_number='+91 98250 11010',
            requirement='Parent communication app and fee portal.', status='converted', created_at=now - timedelta(days=55),
        )
        log(school, 'connected_interested', 'Principal is open to a mobile app.', 52)
        won_prospect = Prospect.objects.create(
            owner=riya, company_name='Meridian Pharma', place='Hyderabad', website='meridianpharma.com', industry='Pharma',
            contact_person='Dr. Ravi Teja', designation='CTO', contact_number='+91 98480 11011',
            requirement='Internal compliance dashboard.', status='converted', created_at=now - timedelta(days=90),
        )
        log(won_prospect, 'connected_interested', 'CTO wants compliance reports automated.', 88)

        hotel_lead = Lead.objects.create(
            prospect=hotel, owner=riya, title='Direct booking engine', expected_value=450000, status='proposal_submitted',
            description='Booking engine with payments and channel manager sync.', proposal_submitted_on=today - timedelta(days=5),
            expected_closure_date=today + timedelta(days=14), created_at=now - timedelta(days=30),
        )
        Meeting.objects.create(
            lead=hotel_lead, scheduled_at=at(-30, 15), mode='in_person', location='Lakeview Resorts, Udaipur',
            attendees='Anita Singh, Riya Mehta', agenda='Understand the booking journey',
            minutes='They lose about 22% of revenue to OTA commissions. Need a branded booking flow with UPI + cards and Booking.com sync.',
            next_steps='Prepare proposal with phased delivery.', created_by=riya,
        )
        school_lead = Lead.objects.create(
            prospect=school, owner=arjun, title='Parent app and fee portal', expected_value=320000, status='negotiation',
            proposal_submitted_on=today - timedelta(days=12), expected_closure_date=today + timedelta(days=7), created_at=now - timedelta(days=45),
        )
        Meeting.objects.create(
            lead=school_lead, scheduled_at=at(-44, 11), mode='in_person', location='School campus', attendees='Mrs. Iyer, Arjun',
            minutes='Needs attendance alerts, fee reminders and circulars. 1,200 students.', next_steps='Send proposal.', created_by=arjun,
        )
        Meeting.objects.create(
            lead=school_lead, scheduled_at=at(3, 12), mode='video', agenda='Commercial discussion with the trustees',
            conducted=False, created_by=arjun,
        )
        won_lead = Lead.objects.create(
            prospect=won_prospect, owner=riya, title='Compliance dashboard', expected_value=600000, status='won',
            proposal_submitted_on=today - timedelta(days=60), created_at=now - timedelta(days=80), closed_at=now - timedelta(days=45),
        )
        Meeting.objects.create(
            lead=won_lead, scheduled_at=at(-78, 14), mode='video', attendees='Dr. Ravi Teja, Riya',
            minutes='Walked through audit workflow. They need role-based dashboards and exportable audit trails.', created_by=riya,
        )

        meridian = Client.objects.create(
            lead=won_lead, owner=riya, company_name='Meridian Pharma', place='Hyderabad', website='meridianpharma.com',
            contact_person='Dr. Ravi Teja', designation='CTO', contact_number='+91 98480 11011', email='ravi@meridianpharma.com',
            address='Plot 14, Genome Valley, Hyderabad', gst_number='36AABCM1234F1Z5', onboarded_on=today - timedelta(days=45),
        )
        project = Project.objects.create(
            client=meridian, name='Compliance Dashboard v1', project_type='software', status='in_progress',
            description='Role-based compliance dashboards with exportable audit trails.',
            start_date=today - timedelta(days=40), deadline=today + timedelta(days=20), budget=600000, created_by=riya,
        )
        project.team.set([karan, meera])
        for title, assignee, priority, state, offset in [
            ('Set up auth and role model', karan, 'high', 'done', -30),
            ('Audit trail data model', karan, 'high', 'in_progress', 2),
            ('Dashboard UI - overview page', meera, 'medium', 'in_progress', 4),
            ('Export to PDF and CSV', karan, 'medium', 'todo', 9),
            ('UAT feedback fixes', meera, 'urgent', 'todo', -1),
        ]:
            Task.objects.create(
                project=project, title=title, assigned_to=assignee, priority=priority, status=state,
                deadline=today + timedelta(days=offset), created_by=riya,
                completed_at=now - timedelta(days=28) if state == 'done' else None,
            )
        Invoice.objects.create(
            client=meridian, invoice_number='DL-2026-0001', title='Milestone 1 - Discovery and design', amount=180000,
            issue_date=today - timedelta(days=40), due_date=today - timedelta(days=30), status='paid', paid_on=today - timedelta(days=28),
            created_by=riya,
        )
        Invoice.objects.create(
            client=meridian, invoice_number='DL-2026-0002', title='Milestone 2 - Core build', amount=240000,
            issue_date=today - timedelta(days=12), due_date=today - timedelta(days=2), status='sent', created_by=riya,
        )

        hotel_client_prospect = Prospect.objects.create(
            owner=arjun, company_name='Harbor Coffee Roasters', place='Kochi', website='harborcoffee.co', industry='Retail',
            contact_person='Joseph Mathew', designation='Founder', contact_number='+91 98470 11012',
            requirement='Shopify-style storefront with subscriptions.', status='converted', created_at=now - timedelta(days=70),
        )
        harbor_lead = Lead.objects.create(
            prospect=hotel_client_prospect, owner=arjun, title='Subscription storefront', expected_value=280000, status='won',
            proposal_submitted_on=today - timedelta(days=50), created_at=now - timedelta(days=60), closed_at=now - timedelta(days=35),
        )
        harbor = Client.objects.create(
            lead=harbor_lead, owner=arjun, company_name='Harbor Coffee Roasters', place='Kochi', website='harborcoffee.co',
            contact_person='Joseph Mathew', designation='Founder', contact_number='+91 98470 11012', email='joseph@harborcoffee.co',
            onboarded_on=today - timedelta(days=35),
        )
        harbor_project = Project.objects.create(
            client=harbor, name='Storefront and subscriptions', project_type='web', status='review',
            start_date=today - timedelta(days=33), deadline=today + timedelta(days=6), budget=280000, created_by=arjun,
        )
        harbor_project.team.set([meera])
        for title, state, offset in [('Storefront theme build', 'done', -12), ('Subscription checkout', 'review', 3), ('Launch checklist', 'todo', 6)]:
            Task.objects.create(
                project=harbor_project, title=title, assigned_to=meera, status=state, deadline=today + timedelta(days=offset),
                created_by=arjun, completed_at=now - timedelta(days=10) if state == 'done' else None,
            )
        Invoice.objects.create(
            client=harbor, invoice_number='DL-2026-0003', title='50% advance', amount=140000,
            issue_date=today - timedelta(days=33), due_date=today - timedelta(days=26), status='paid', paid_on=today - timedelta(days=24),
            created_by=arjun,
        )

        for offset in range(1, 8):
            day = today - timedelta(days=offset)
            if day.weekday() == 6:
                continue
            for member in (admin, riya, arjun, karan, meera):
                if member is arjun and offset == 3:
                    Attendance.objects.create(user=member, date=day, status='leave')
                    continue
                check_in = timezone.make_aware(datetime.combine(day, time(9, 40 + (member.id % 5) * 4)))
                Attendance.objects.create(
                    user=member, date=day, work_mode='remote' if offset % 3 == 0 else 'office',
                    check_in=check_in, check_out=check_in + timedelta(hours=8, minutes=15),
                    timesheet=(
                        'Cold-called 25 prospects, 2 meetings booked, followed up on proposals.' if member.role == 'sales'
                        else 'Built audit trail models, reviewed PRs and fixed dashboard bugs.' if member.role == 'dev'
                        else 'Reviewed pipeline, invoices and project deadlines.'
                    ),
                )

        month = today.replace(day=1)
        for member, metric, value in [
            (riya, 'calls_made', 120), (riya, 'prospects_added', 25), (riya, 'meetings_held', 8), (riya, 'revenue', 400000),
            (arjun, 'calls_made', 100), (arjun, 'prospects_added', 20), (arjun, 'clients_won', 2), (arjun, 'revenue', 250000),
            (karan, 'tasks_completed', 12), (karan, 'hours_logged', 160),
            (meera, 'tasks_completed', 10), (meera, 'hours_logged', 160),
        ]:
            Target.objects.create(user=member, month=month, metric=metric, target_value=value, set_by=admin)

        self.stdout.write(self.style.SUCCESS(f'Demo data created. Team accounts use the password {TEAM_PASSWORD}.'))
